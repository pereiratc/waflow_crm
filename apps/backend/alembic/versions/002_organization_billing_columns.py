"""Add organization billing columns when missing (existing DBs created before billing fields).

Revision ID: 002
Revises: 001
Create Date: 2026-04-02

"""

from typing import Sequence, Union

from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # PostgreSQL: idempotent adds for deployments that used create_all before these columns existed.
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'billing_plan'
          ) THEN
            ALTER TABLE organizations ADD COLUMN billing_plan VARCHAR(20) NOT NULL DEFAULT 'free';
          END IF;
        END $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'max_users'
          ) THEN
            ALTER TABLE organizations ADD COLUMN max_users INTEGER NOT NULL DEFAULT 5;
          END IF;
        END $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'max_automation_rules'
          ) THEN
            ALTER TABLE organizations ADD COLUMN max_automation_rules INTEGER NOT NULL DEFAULT 10;
          END IF;
        END $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'stripe_customer_id'
          ) THEN
            ALTER TABLE organizations ADD COLUMN stripe_customer_id VARCHAR(120) NULL;
          END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE organizations DROP COLUMN IF EXISTS stripe_customer_id;")
    op.execute("ALTER TABLE organizations DROP COLUMN IF EXISTS max_automation_rules;")
    op.execute("ALTER TABLE organizations DROP COLUMN IF EXISTS max_users;")
    op.execute("ALTER TABLE organizations DROP COLUMN IF EXISTS billing_plan;")
