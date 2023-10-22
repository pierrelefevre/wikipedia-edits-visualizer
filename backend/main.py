import threading
import json
import os

from flask import Flask, Response, request
from flask_cors import CORS

from kafka import KafkaConsumer
from cerberus import Validator

from spark import count_total, user_count, user_largest_edit_size

app = Flask(__name__)
CORS(app)

# kafka_host = 'vm.cloud.cbh.kth.se:2579'
# kafka_host = 'localhost:9092'
kafka_host = f'{os.environ["KAFKA_HOST"]}:{os.environ["KAFKA_PORT"]}'
kafka_topic = os.environ['KAFKA_TOPIC']

print(f'Kafka host: {kafka_host}')
print(f'Kafka topic: {kafka_topic}')

event_data_schema = {
    'title': {'type': 'string', 'required': True},
    'user': {'type': 'string', 'required': True},
    'type': {'type': 'string', 'required': True},
    'length': {
        'type': 'dict',
        'required': True,
        'schema': {
            'old': {'type': 'integer', 'required': True},
            'new': {'type': 'integer', 'required': True}
        }
    }
}

validator = Validator(event_data_schema, allow_unknown=True)

# This function generates SSE data


def generate_sse_data(filter):
    consumer = KafkaConsumer(
        kafka_topic, auto_offset_reset='latest', bootstrap_servers=[kafka_host])

    while True:
        next_event = next(consumer).value.decode('utf-8')

        # we want to send only title, user and edit size
        # so we parse the json and create a new one

        json_event = json.loads(next_event)

        try:
            edit_size = json_event['length']['new'] - \
                json_event['length']['old']
            new_event = {
                'title': json_event['title'],
                'user': json_event['user'],
                'editSize':  edit_size
            }

            if filter == 'large':
                if edit_size < 500:
                    continue
            elif filter == 'small':
                if edit_size >= 100:
                    continue

            yield "data: {}\n\n".format(json.dumps(new_event))
        except KeyError:
            continue


@app.route('/v1/events')
def sse():
    filter = request.args.get('filter', default='all', type=str)
    return Response(generate_sse_data(filter), content_type='text/event-stream')


total_cache = 0
user_count_cache = []
user_largest_edit_size_cache = []


def cache_results():
    global total_cache
    global user_count_cache
    global user_largest_edit_size_cache

    total_cache = count_total()
    user_count_cache = user_count()
    user_largest_edit_size_cache = user_largest_edit_size()


@app.route('/v1/stats')
def stats():
    # Handle GET requests for /v1/stats here
    # You can place your logic to retrieve and return statistics data

    media = {}

    threading.Thread(target=cache_results).start()

    media['total_edits'] = total_cache
    media['user_top_edit_count'] = user_count_cache
    media['user_top_edit_size'] = user_largest_edit_size_cache

    return Response(json.dumps(media), content_type='application/json')


if __name__ == '__main__':
    app.debug = False
    app.run(host='0.0.0.0', port=8080)
