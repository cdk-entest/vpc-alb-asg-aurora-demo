# =============================================================================
# created date: 20/06/2022 by haimtran
# 1. create connector
# 2. create tables 
# 3. show tables 
# 4. write data to tables 
# +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
# updated date: 07/07/2023 by haimtran
# 1. get region and secret id from enviornment variables 
# 2. hard code connection when not avaiable from secret values
# =============================================================================
import os
import datetime
import mysql.connector
import boto3
import json
import names
import random

# database connection 
DB_HOST = "database-1.cluster-ckcjxpoafmdf.ap-southeast-1.rds.amazonaws.com"
DB_PORT = 3306
DB_NAME = "covid"

# secret and region
try:
    SECRET_ID = os.environ["SECRET_ID"]
    REGION = os.environ["REGION"]
except:
    SECRET_ID = "rds!cluster-9f91a71d-7918-4dc4-9b4c-4754a2d39f8e"
    REGION = "ap-southeast-1"

# sm client
secrete_client = boto3.client("secretsmanager", region_name=REGION)

# get secret string
secret = secrete_client.get_secret_value(SecretId=SECRET_ID)

# parse db information
secret_dic = json.loads(secret["SecretString"])
print(secret_dic)

# if host, dbname, port not in the dict 
if ("port" not in secret_dic):
    secret_dic["port"] = DB_PORT
if ("host" not in secret_dic):
    secret_dic["host"] = DB_HOST 
if ("dbname" not in secret_dic):
    secret_dic["dbname"] = DB_NAME 

# db connector
conn = mysql.connector.connect(
    host=secret_dic["host"],
    user=secret_dic["username"],
    port=secret_dic["port"],
    password=secret_dic["password"],
    database=secret_dic["dbname"],
)
print(f"SUCCESSFULLY CONNECTED TO DB {conn}")


def create_table() -> None:
    """
    create a rds table
    """
    # cursor
    cur = conn.cursor()
    # drop table if exists
    drop = "DROP TABLE IF EXISTS employees"
    cur.execute(drop)
    # create table
    employee_table = (
        "CREATE TABLE employees ("
        "    id TINYINT UNSIGNED NOT NULL AUTO_INCREMENT, "
        "    name VARCHAR(30) DEFAULT '' NOT NULL, "
        "    age TEXT, "
        "    time TEXT, "
        "PRIMARY KEY (id))"
    )
    cur.execute(employee_table)
    # time stamp
    now = datetime.datetime.now()
    time_stamp = now.strftime("%Y/%m/%d-%H:%M:%S.%f")
    # employees (id, name, age, time)
    employees = [
        (k, names.get_full_name(), random.randint(20, 100), time_stamp)
        for k in range(1, 100)
    ]
    # tuple
    employees = tuple(employees)
    stmt_insert = "INSERT INTO employees (id, name, age, time) VALUES (%s, %s, %s, %s)"
    cur.executemany(stmt_insert, employees)
    conn.commit()
    # show table
    cur.execute("SHOW TABLES")
    tables = cur.fetchall()
    for table in tables:
        print(f"table: {table}")
    # close connect
    cur.close()
    conn.close()


def fetch_data():
    """
    fetch data
    """
    # init
    outputs = []
    #
    cur = conn.cursor()
    #
    stmt_select = "SELECT id, name, age, time FROM employees ORDER BY id"
    cur.execute(stmt_select)
    # parse
    for row in cur.fetchall():
        print(row)
    # return
    return outputs


def drop_table() -> None:
    """
    drop table
    """
    # cursor
    cur = conn.cursor()
    # drop table if exists
    drop = "DROP TABLE IF EXISTS employees"
    # execute
    cur.execute(drop)
    #
    print("DELETED TABLE")


if __name__ == "__main__":
    # create_table()
    fetch_data()
    # drop_table()
