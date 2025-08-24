import threading
from core.appsrv import app, socketio
from core.appui import appui


def run_appsrv():
    socketio.run(app, port=25823, debug=False, use_reloader=False, log_output=False)

def run_appui():
    appui.run(debug=True)

def main():
    threading.Thread(target=run_appsrv, daemon=True).start()
    run_appui()



if __name__ == "__main__":
    main()
