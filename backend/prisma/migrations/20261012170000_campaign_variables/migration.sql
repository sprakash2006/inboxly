-- Per-recipient template variable values for campaigns.
ALTER TABLE "Campaign" ADD COLUMN "variableConfig" JSONB;
ALTER TABLE "CampaignRecipient" ADD COLUMN "variables" JSONB;
