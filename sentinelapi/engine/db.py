import logging
from typing import Optional

logger = logging.getLogger("sentinel.db")

try:
    from prisma import Prisma
    prisma = Prisma()
except ImportError:
    prisma = None
    logger.warning("Prisma client not yet generated. Run 'prisma generate' to initialize.")

async def connect_db():
    global prisma
    if prisma is None:
        try:
            from prisma import Prisma
            prisma = Prisma()
        except ImportError:
            logger.error("Could not import Prisma client. Please run 'prisma generate'.")
            return
    if not prisma.is_connected():
        try:
            await prisma.connect()
            logger.info("Connected to PostgreSQL database via Prisma.")
        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")

async def disconnect_db():
    global prisma
    if prisma and prisma.is_connected():
        await prisma.disconnect()
        logger.info("Disconnected from PostgreSQL database.")

def get_db():
    return prisma
