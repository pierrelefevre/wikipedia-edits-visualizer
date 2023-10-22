# This file is for loading a spark streaming session with sql
import time
from pyspark.sql.functions import col, from_unixtime, to_date, to_timestamp
from pyspark.sql.types import StructType, StructField, BooleanType, LongType, IntegerType
from pyspark.sql.functions import from_json
from pyspark.sql.types import StringType
from pyspark import SparkConf
from pyspark.sql.functions import count, explode, split, col, sum
from pyspark.sql import SparkSession
import os

kafka_host = f'{os.environ["KAFKA_HOST"]}:{os.environ["KAFKA_PORT"]}'
kafka_topic = os.environ['KAFKA_TOPIC']


# Create a SparkConf and configure the JVM options
conf = SparkConf()
conf.set("spark.driver.memory", "4g")  # Set driver memory
conf.set("spark.executor.memory", "8g")  # Set executor memory
conf.set("spark.jars.packages",
         "org.apache.spark:spark-sql-kafka-0-10_2.12:3.4.1")

# Spark session & context
spark = (SparkSession
         .builder
         .master('local')
         .appName(f'{kafka_topic}-event-consumer')
         # Add kafka package
         .config(conf=conf)
         # .config("spark.sql.shuffle.partitions", 10)  # Set the number of partitions
         .getOrCreate())
sc = spark.sparkContext


# Create stream dataframe setting kafka server, topic and offset option
df = (spark
      .readStream
      .format("kafka")
      .option("kafka.bootstrap.servers", kafka_host)  # kafka server
      .option("subscribe", kafka_topic)  # topic
      .option("failOnDataLoss", "false")
      .option("kafka.metadata.max.age.ms", "1000")
      .option("startingOffsets", "latest")  # start from beginning
      .load())


# Convert binary to string key and value
df1 = (df
       .withColumn("key", df["key"].cast(StringType()))
       .withColumn("value", df["value"].cast(StringType())))


# Event data schema
schema_wiki = StructType(
    [StructField("$schema", StringType(), True),
     StructField("bot", BooleanType(), True),
     StructField("comment", StringType(), True),
     StructField("id", StringType(), True),
     StructField("length",
                 StructType(
                     [StructField("new", IntegerType(), True),
                      StructField("old", IntegerType(), True)]), True),
     StructField("meta",
                 StructType(
                     [StructField("domain", StringType(), True),
                      StructField("dt", StringType(), True),
                      StructField("id", StringType(), True),
                      StructField("offset", LongType(), True),
                      StructField("partition", LongType(), True),
                      StructField("request_id", StringType(), True),
                      StructField("stream", StringType(), True),
                      StructField("topic", StringType(), True),
                      StructField("uri", StringType(), True)]), True),
     StructField("minor", BooleanType(), True),
     StructField("namespace", IntegerType(), True),
     StructField("parsedcomment", StringType(), True),
     StructField("patrolled", BooleanType(), True),
     StructField("revision",
                 StructType(
                     [StructField("new", IntegerType(), True),
                      StructField("old", IntegerType(), True)]), True),
     StructField("server_name", StringType(), True),
     StructField("server_script_path", StringType(), True),
     StructField("server_url", StringType(), True),
     StructField("timestamp", IntegerType(), True),
     StructField("title", StringType(), True),
     StructField("type", StringType(), True),
     StructField("user", StringType(), True),
     StructField("wiki", StringType(), True)])


# Create dataframe setting schema for event data
# Sets schema for event data
df_wiki = (df1.withColumn("value", from_json("value", schema_wiki)))


# Transform into tabular
# Convert unix timestamp to timestamp
# Create partition column (change_timestamp_date)
df_wiki_formatted = (df_wiki.select(
    col("key").alias("event_key"), col("topic").alias("event_topic"), col("timestamp").alias("event_timestamp"), col("value.$schema").alias("schema"), "value.bot", "value.comment", "value.id", col("value.length.new").alias("length_new"), col("value.length.old").alias("length_old"), "value.minor", "value.namespace", "value.parsedcomment", "value.patrolled", col("value.revision.new").alias("revision_new"), col("value.revision.old").alias("revision_old"), "value.server_name", "value.server_script_path", "value.server_url", to_timestamp(from_unixtime(col("value.timestamp"))).alias(
        "change_timestamp"), to_date(from_unixtime(col("value.timestamp"))).alias("change_timestamp_date"), "value.title", "value.type", "value.user", "value.wiki", col("value.meta.domain").alias("meta_domain"), col("value.meta.dt").alias("meta_dt"), col("value.meta.id").alias("meta_id"), col("value.meta.offset").alias("meta_offset"), col("value.meta.partition").alias("meta_partition"), col("value.meta.request_id").alias("meta_request_id"), col("value.meta.stream").alias("meta_stream"), col("value.meta.topic").alias("meta_topic"), col("value.meta.uri").alias("meta_uri")
))

count_query = (df_wiki_formatted
               .agg(count("*").alias("total_rows"))  # Count the rows
               .writeStream
               .queryName("counting")
               .format("memory")
               .outputMode("complete")
               .start())


def count_total():
    return spark.sql("select * from counting").collect()[0].total_rows


# group by user count
user_count_query = (df_wiki_formatted
                    .groupBy("user")
                    .agg(count("*").alias("total_rows"))  # Count the rows
                    .writeStream
                    .queryName("user_counting")
                    .format("memory")
                    .outputMode("complete")
                    .start())


def user_count():
    # select top 10 users
    return spark.sql("select * from user_counting order by total_rows desc limit 10").collect()


# group by user largest edit size count
user_largest_edit_size_query = (df_wiki_formatted
                                .groupBy("user")
                                # Count the rows
                                .agg(sum(col("length_new") - col("length_old")).alias("edit_size"))
                                .writeStream
                                .queryName("user_largest_edit_size_counting")
                                .format("memory")
                                .outputMode("complete")
                                .start())


def user_largest_edit_size():
    # select top 10 users
    return spark.sql("select * from user_largest_edit_size_counting order by edit_size desc limit 10").collect()
