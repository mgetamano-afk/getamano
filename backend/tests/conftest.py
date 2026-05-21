"""Pytest conftest — auto-loaded by pytest. Adds the tests dir to sys.path so
sibling modules (test_config) are importable when running `pytest backend_test.py`."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
