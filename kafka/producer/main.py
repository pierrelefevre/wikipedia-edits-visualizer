import json
import time

from sseclient import SSEClient as EventSource
from kafka import KafkaProducer

print("Starting producer...")

# Create producer
conn_attempts = 0
max_conn_attempts = 10

while conn_attempts < max_conn_attempts:
    try:
        if conn_attempts == max_conn_attempts:
            print("Failed to connect to Kafka server... exiting")
            exit()

        producer = KafkaProducer(
            bootstrap_servers='localhost:9092',  # Kafka server
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
                producer.send('wiki-changes', change)

except KeyboardInterrupt:
    print("process interrupted")
