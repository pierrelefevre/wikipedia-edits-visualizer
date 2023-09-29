from flask import Flask, Response
import time
import json

from kafka import KafkaConsumer
from cerberus import Validator

app = Flask(__name__)

kafka_host = 'vm.cloud.cbh.kth.se:2579'
# kafka_host = 'localhost:9092'

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


def generate_sse_data():
    consumer = KafkaConsumer(
        'wiki-changes', auto_offset_reset='latest', bootstrap_servers=[kafka_host])

    while True:
        next_event = next(consumer).value.decode('utf-8')

        # we want to send only title, user and edit size
        # so we parse the json and create a new one

        json_event = json.loads(next_event)

        if not validator.validate(json_event):
            continue

        edit_size = json_event['length']['new'] - json_event['length']['old']
        new_event = {
            'title': json_event['title'],
            'user': json_event['user'],
            'editSize':  edit_size
        }

        yield "data: {}\n\n".format(json.dumps(new_event))


@ app.route('/v1/events')
def sse():
    return Response(generate_sse_data(), content_type='text/event-stream')


if __name__ == '__main__':
    app.debug = False
    app.run(host='0.0.0.0', port=8080)
