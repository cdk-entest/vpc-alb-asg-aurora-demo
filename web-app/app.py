# =============================================================================
# author: haimtran     | created date: 20/06/2022
# +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
# updated date: 07/07/2023
# 1. get region and secret id from enviornment variables 
# 2. hard code connection when not avaiable from secret values
# =============================================================================
import os
import mysql.connector
import boto3
import json
from flask import Flask, render_template
from flask_table import Table, Col

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

class ItemTable(Table):
    """
    flask app generate tables
    TODO: tailwind
    """

    id = Col("Id")
    name = Col("Name")
    age = Col("Age")
    time = Col("Time")


class Item(object):
    """
    table item
    """

    def __init__(self, id, name, age, time):
        """ """
        self.id = id
        self.name = name
        self.age = age
        self.time = time


def conect_db():
    """
    connect db
    """
    # sm client
    secrete_client = boto3.client("secretsmanager", region_name=REGION)
    # get secret string
    secret = secrete_client.get_secret_value(SecretId=SECRET_ID)
    # parse db information
    secret_dic = json.loads(secret["SecretString"])
    # 
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
    print("SUCCESSFULLY CONNECTED TO DB")
    # return
    return conn


def fetch_data():
    """
    create a rds table
    """
    # table data
    employees = []
    # init
    outputs = []
    # connect
    conn = conect_db()
    # cursor
    cur = conn.cursor()
    # query
    stmt_select = "SELECT id, name, age, time FROM employees ORDER BY id"
    cur.execute(stmt_select)
    # parse
    for row in cur.fetchall():
        outputs.append(row)
        print(row)

    # item object
    for output in outputs:
        employees.append(Item(output[0], output[1], output[2], output[3]))

    # close connect
    cur.close()
    conn.close()
    # return
    return ItemTable(employees)


app = Flask(
    __name__, static_url_path="", static_folder="static", template_folder="template"
)


@app.route("/home")
def hello_world():
    return app.send_static_file("index.html")


@app.route("/")
def query_data():
    # fetch data
    try:
        table = fetch_data()
        # table = None
        # pass
    except:
        table = None
    # return
    return render_template("employee.html", table=table)


if __name__ == "__main__":
    # fetch_data()
    app.run(host="0.0.0.0", port=80)
