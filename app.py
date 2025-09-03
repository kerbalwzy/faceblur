import threading
import socket
import time
import socketio
import argparse


PORT = 25823
SIOSRVURL = f"http://localhost:{PORT}"
SOCKET_TIMEOUT = 1


def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(SOCKET_TIMEOUT)
        try:
            s.bind(("localhost", port))
            return False
        except socket.error:
            return True
        finally:
            s.close()


def send_message_to_existing_instance():
    sio = socketio.Client(reconnection=False)
    try:
        sio.connect(SIOSRVURL, wait_timeout=5)
        sio.emit("show_window", None)
        time.sleep(2)  # make sure the message is sent
        sio.disconnect()
        exit(0)
    except Exception as e:
        pass
    finally:
        if sio.connected:
            sio.disconnect()


def run_appsrv():
    from core.appsrv import app, socketio as siosrv

    siosrv.run(app, port=PORT, debug=False, use_reloader=False, log_output=False)


def run_appui():
    from core.appui import appui

    args = argparse.ArgumentParser()
    args.add_argument("--debug", action="store_true", help="Run app UI in debug mode")
    args = args.parse_args()
    appui.run(debug=args.debug)


def main():
    if is_port_in_use(PORT):
        print("App is already running, try to send message to open app window...")
        send_message_to_existing_instance()
        return
    threading.Thread(target=run_appsrv, daemon=True).start()
    run_appui()


if __name__ == "__main__":
    main()
