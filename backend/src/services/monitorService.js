import EventEmitter from 'events';

const MAX_LOGS_PER_CAMPAIGN = 500;
const campaigns = new Map();
let nextLogId = 1;

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

function toCampaignId(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

function ensureCampaign(campaignId, campaignName) {
  const id = toCampaignId(campaignId);
  if (!id) {
    return null;
  }

  const existing = campaigns.get(id);
  if (existing) {
    if (campaignName && existing.name !== campaignName) {
      existing.name = String(campaignName);
      emitter.emit('campaigns', listCampaigns());
    }
    return existing;
  }

  const campaign = {
    id,
    name: campaignName ? String(campaignName) : `Campaña ${id}`,
    logs: []
  };
  campaigns.set(id, campaign);
  emitter.emit('campaigns', listCampaigns());
  return campaign;
}

function createLogEntry(campaign, message, level = 'info', metadata = {}) {
  const timestamp = new Date().toISOString();
  return {
    id: `${Date.now()}-${nextLogId++}`,
    campaignId: campaign.id,
    campaignName: campaign.name,
    timestamp,
    level,
    message,
    metadata
  };
}

export function logCampaignEvent({
  campaignId,
  campaignName,
  message,
  level = 'info',
  metadata = {}
}) {
  const campaign = ensureCampaign(campaignId, campaignName);
  if (!campaign || !message) {
    return null;
  }

  const entry = createLogEntry(campaign, String(message), level, metadata);
  campaign.logs.push(entry);
  if (campaign.logs.length > MAX_LOGS_PER_CAMPAIGN) {
    campaign.logs.splice(0, campaign.logs.length - MAX_LOGS_PER_CAMPAIGN);
  }

  emitter.emit('log', entry);
  return entry;
}

export function listCampaigns() {
  return Array.from(campaigns.values())
    .map((campaign) => ({ id: campaign.id, name: campaign.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getCampaignLogs(campaignId) {
  const id = toCampaignId(campaignId);
  if (!id) {
    return [];
  }

  const campaign = campaigns.get(id);
  return campaign ? [...campaign.logs] : [];
}

export function getAllLogs() {
  return Array.from(campaigns.values())
    .flatMap((campaign) => campaign.logs)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

export function subscribeToLogs(listener) {
  emitter.on('log', listener);
  return () => {
    emitter.off('log', listener);
  };
}

export function subscribeToCampaigns(listener) {
  emitter.on('campaigns', listener);
  return () => {
    emitter.off('campaigns', listener);
  };
}
