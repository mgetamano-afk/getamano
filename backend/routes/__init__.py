"""routes package — modular FastAPI routers extracted from server.py.

Mounted from server.py via include_router(). Each module has a
`configure(...)` function that receives the shared db handle + helpers.
"""
