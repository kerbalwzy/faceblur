import argparse
from core.appui import appui


def main():
    args = argparse.ArgumentParser()
    args.add_argument("--debug", action="store_true", help="Run app UI in debug mode")
    args = args.parse_args()
    appui.run(debug=args.debug)


if __name__ == "__main__":
    main()
