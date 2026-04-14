from app.models.base import Base
from app.models.organization import Organization
from app.models.user import User

# Phase 2+3 models (imported for table registration)
from app.models.contacts import Contact  # noqa: F401
from app.models.conversations import Conversation  # noqa: F401
from app.models.conversation_messages import ConversationMessage  # noqa: F401
from app.models.message_attachments import MessageAttachment  # noqa: F401
from app.models.whatsapp_routes import WhatsappPhoneRoute  # noqa: F401
from app.models.webhook_events import WebhookEvent  # noqa: F401

from app.models.pipelines import Pipeline  # noqa: F401
from app.models.pipeline_stages import PipelineStage  # noqa: F401
from app.models.leads import Lead  # noqa: F401
from app.models.lead_stage_history import LeadStageHistory  # noqa: F401

from app.models.automation_rules import AutomationRule  # noqa: F401
from app.models.automation_runs import AutomationRun  # noqa: F401

