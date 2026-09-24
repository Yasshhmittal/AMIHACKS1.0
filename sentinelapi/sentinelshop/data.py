"""
In-memory seed data and reset handlers for SentinelShop.
"""

from typing import Dict, Any, List
import copy

INITIAL_USERS = {
    1: {
        "id": 1,
        "username": "alice",
        "email": "alice@example.com",
        "role": "user",
        "passwordHash": "$2b$12$e8Y6k8l9alicepasswordhashsalt999",
        "internalNotes": "VIP customer credit limit 100k approved",
        "creditScore": 780,
        "token": "token-alice-12345"
    },
    2: {
        "id": 2,
        "username": "bob",
        "email": "bob@example.com",
        "role": "user",
        "passwordHash": "$2b$12$d8X5k8l9bobpasswordhashsalt888",
        "internalNotes": "Account flagged for manual KYC review",
        "creditScore": 620,
        "token": "token-bob-67890"
    },
    9: {
        "id": 9,
        "username": "admin",
        "email": "admin@sentinelshop.local",
        "role": "admin",
        "passwordHash": "$2b$12$k9Z1k8l9adminpasswordhashsalt777",
        "internalNotes": "Root superadministrator account",
        "creditScore": 850,
        "token": "token-admin-99999"
    }
}

INITIAL_ORDERS = {
    101: {"id": 101, "userId": 1, "item": "Quantum Keyboard", "amount": 199.99, "status": "delivered"},
    102: {"id": 102, "userId": 2, "item": "Cyberpunk Hoodie", "amount": 89.50, "status": "shipped"},
    103: {"id": 103, "userId": 1, "item": "OLED Monitor 27-inch", "amount": 450.00, "status": "processing"},
    104: {"id": 104, "userId": 2, "item": "Hardware Security Key", "amount": 55.00, "status": "pending"}
}

INITIAL_INVOICES = {
    501: {"id": 501, "userId": 1, "invoiceNumber": "INV-2026-001", "amount": 199.99, "tax": 16.00},
    502: {"id": 502, "userId": 2, "invoiceNumber": "INV-2026-002", "amount": 89.50, "tax": 7.16}
}

users_db: Dict[int, Dict[str, Any]] = copy.deepcopy(INITIAL_USERS)
orders_db: Dict[int, Dict[str, Any]] = copy.deepcopy(INITIAL_ORDERS)
invoices_db: Dict[int, Dict[str, Any]] = copy.deepcopy(INITIAL_INVOICES)
login_attempts: List[str] = []

def reset_database():
    global users_db, orders_db, invoices_db, login_attempts
    users_db = copy.deepcopy(INITIAL_USERS)
    orders_db = copy.deepcopy(INITIAL_ORDERS)
    invoices_db = copy.deepcopy(INITIAL_INVOICES)
    login_attempts = []
