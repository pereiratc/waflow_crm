"""Baseline placeholder — run `alembic revision --autogenerate -m "describe"` against a DB that matches models.

Revision ID: 001
Revises:
Create Date: 2026-04-02

"""

from typing import Sequence, Union

from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
