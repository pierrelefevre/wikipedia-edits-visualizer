FROM python

WORKDIR /app

COPY ./requirements.txt /app/requirements.txt

RUN pip install -r /app/requirements.txt

COPY ./ /app/

ENV PYTHONUNBUFFERED=1

ENTRYPOINT [ "python", "/app/main.py" ]
