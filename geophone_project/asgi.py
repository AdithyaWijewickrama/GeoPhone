"""
ASGI config for geophone_project project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.1/howto/deployment/asgi/
"""

import os

from dotenv import load_dotenv

from django.core.asgi import get_asgi_application

load_dotenv()  # Load environment variables from .env before Django settings are read

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'geophone_project.settings')

application = get_asgi_application()
