"""Background processing service package."""

__version__ = "1.0.0"
__author__ = "VitrineLu Marketing"
__description__ = "Microservice for background cleanup and generative background replacement"

from .main import app

__all__ = ["app"]