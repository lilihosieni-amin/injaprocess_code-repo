from upload_bot.app import build_application
from upload_bot.config import Config


def main():
    config = Config.from_env()
    app = build_application(config)
    app.run_polling()


if __name__ == "__main__":
    main()
