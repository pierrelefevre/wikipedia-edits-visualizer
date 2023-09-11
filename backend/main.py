import falcon
import falcon.asgi
import uvicorn
import json
import websockets

from kafka import KafkaConsumer
from cerberus import Validator

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

class EventResource:
    # define a websocket handler for the /v1/events endpoint
    async def on_websocket(self, req, websocket):
        await websocket.accept()
        consumer = KafkaConsumer(
            'wiki-changes', auto_offset_reset='latest', bootstrap_servers=[kafka_host])
       
        try:
            while True:
                next_event = next(consumer).value.decode('utf-8')

                # we want to send only title, user and edit size
                # so we parse the json and create a new one

                json_event = json.loads(next_event)

                if not validator.validate(json_event):
                    continue

                edit_size = abs(json_event['length']
                                ['new'] - json_event['length']['old'])
                new_event = {
                    'title': json_event['title'],
                    'user': json_event['user'],
                    'editSize':  edit_size
                }

                await websocket.send_text(json.dumps(new_event))
        except websockets.exceptions.ConnectionClosedError:
            # Handle WebSocket closure here, if needed
            print("WebSocket closed")

app = falcon.asgi.App()
app.add_route('/v1/events', EventResource())

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=True)
