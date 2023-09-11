import asyncio
import websockets

ws = None

async def listen_to_websocket():
    # Replace with the WebSocket URL you want to connect to
    uri = "ws://localhost:8080/v1/events"

    async with websockets.connect(uri) as websocket:
        print(f"Connected to {uri}")

        global ws
        ws = websocket

        while True:
            try:
                message = await websocket.recv()
                print("Received message from server:", message)
            except websockets.ConnectionClosed:
                print("WebSocket connection closed.")
                break
            
if __name__ == "__main__":
    try:
        asyncio.get_event_loop().run_until_complete(listen_to_websocket())
    except KeyboardInterrupt:
        if ws is not None:
            print("Closing WebSocket connection...")
            ws.close()
        print("Shutting down.")