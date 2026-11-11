"""Typed domain errors. Every error carries a stable ``code`` the REST layer maps to an
HTTP status and the tool layer returns as ``{"ok": false, "error": code}``."""
from __future__ import annotations

from typing import Any


class FlowerShopError(Exception):
    code = "error"
    http_status = 400

    def __init__(self, message: str, **extra: Any) -> None:
        super().__init__(message)
        self.message = message
        self.extra = extra

    def to_dict(self) -> dict:
        return {"error": self.code, "message": self.message, **self.extra}


class NotFound(FlowerShopError):
    code = "not_found"
    http_status = 404


class ValidationError(FlowerShopError):
    code = "validation_error"
    http_status = 400


class InvalidTransition(FlowerShopError):
    code = "invalid_transition"
    http_status = 409


class InsufficientStock(FlowerShopError):
    code = "insufficient_stock"
    http_status = 409


class ApprovalNotPending(FlowerShopError):
    code = "approval_not_pending"
    http_status = 409


class Conflict(FlowerShopError):
    code = "conflict"
    http_status = 409


class PermissionDenied(FlowerShopError):
    code = "permission_denied"
    http_status = 403
