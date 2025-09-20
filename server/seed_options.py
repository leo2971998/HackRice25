import os
from pymongo import MongoClient

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

def main():
    if load_dotenv is not None:
        load_dotenv()

    uri = os.environ.get("MONGODB_URI")
    db_name = os.environ.get("MONGODB_DB")
    if not uri or not db_name:
        raise RuntimeError("Set MONGODB_URI and MONGODB_DB (e.g., in a .env file)")

    client = MongoClient(uri)
    db = client[db_name]

    db.options.update_one(
        {"_id": "dropdowns"},
        {"$set": {
            "issuers": [
                "American Express","Chase","Capital One","Citi","Bank of America","Discover"
            ],
            "networks": ["Amex","Visa","Mastercard","Discover"]
        }},
        upsert=True,
    )
    print("Seeded issuers and networks into db.options ('_id': 'dropdowns').")

if __name__ == "__main__":
    main()