FROM openjdk:11

# install python
RUN apt-get update && apt-get install -y python3 python3-pip python3-dev

WORKDIR /app

COPY . /app

RUN pip install --trusted-host pypi.python.org -r requirements.txt

CMD ["/usr/bin/python3", "main.py"]