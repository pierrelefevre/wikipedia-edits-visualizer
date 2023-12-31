from kafka import KafkaProducer
from sseclient import SSEClient as EventSource
import json
import time
import os

kafka_host = f'{os.environ["KAFKA_HOST"]}:{os.environ["KAFKA_PORT"]}'
kafka_topic = os.environ['KAFKA_TOPIC']

print("Starting producer...")

# Create producer
conn_attempts = 0
max_conn_attempts = 10
producer = None

while conn_attempts < max_conn_attempts:
    try:
        if conn_attempts == max_conn_attempts:
            print("Failed to connect to Kafka server... exiting")
            exit()

        producer = KafkaProducer(
            bootstrap_servers=kafka_host,  # Kafka server
            value_serializer=lambda v: json.dumps(
                v).encode('utf-8')  # json serializer
        )

        break
    except KeyboardInterrupt:
        print("process interrupted")
        exit()
    except Exception as e:
        print(
            f"Failed to connect to Kafka server: {str(e)} trying again ({conn_attempts}/{max_conn_attempts})")
        conn_attempts += 1

        time.sleep(3)


if producer is None:
    exit()

print("Connected to Kafka server, starting to read stream...")

# Read streaming event
url = 'https://stream.wikimedia.org/v2/stream/recentchange'
no_read = 0
last_read_time = time.time()
try:
    for event in EventSource(url):
        if event.event == 'message':
            no_read += 1

            if time.time() - last_read_time > 5:
                print(f"Read {no_read} messages in the last 5 seconds")
                no_read = 0
                last_read_time = time.time()

            try:
                change = json.loads(event.data)
            except ValueError:
                pass
            else:
                # Send msg to topic wiki-changes
                producer.send(kafka_topic, change)

except Exception as e:
    print(f"Error reading stream: {str(e)}")

except KeyboardInterrupt:
    print("process interrupted")
