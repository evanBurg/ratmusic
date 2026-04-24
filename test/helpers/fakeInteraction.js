import { vi } from 'vitest';

/**
 * Build a minimal fake ChatInputCommandInteraction shaped enough for our handlers.
 *
 * Exposes spy methods on .reply / .editReply / .deferReply / .followUp / .update,
 * plus stateful flags `deferred` and `replied`.
 */
export function makeChatInteraction({
  options = {},
  guildId = 'g1',
  channelId = 'c1',
  userId = 'u1',
  inVoice = true,
  voiceChannelId = 'v1',
  channel = null,
} = {}) {
  const stringOpts = options;
  const interaction = {
    guildId,
    channelId,
    user: { id: userId },
    member: {
      voice: inVoice
        ? {
            channel: {
              id: voiceChannelId,
              guild: { id: guildId, voiceAdapterCreator: () => () => ({}) },
            },
          }
        : { channel: null },
    },
    channel: channel ?? { id: channelId, send: vi.fn().mockResolvedValue({}) },
    options: {
      getString: vi.fn((name, required) => {
        const v = stringOpts[name];
        if (required && (v === undefined || v === null)) return null;
        return v ?? null;
      }),
    },
    deferred: false,
    replied: false,
    isRepliable: () => true,
    isChatInputCommand: () => true,
    isButton: () => false,
    reply: vi.fn(async (payload) => {
      interaction.replied = true;
      interaction._lastReply = payload;
      return payload;
    }),
    editReply: vi.fn(async (payload) => {
      interaction.replied = true;
      interaction._lastEdit = payload;
      return payload;
    }),
    deferReply: vi.fn(async (payload) => {
      interaction.deferred = true;
      interaction._deferOpts = payload;
      return payload;
    }),
    followUp: vi.fn(async (payload) => {
      interaction._lastFollowUp = payload;
      return payload;
    }),
    update: vi.fn(async (payload) => {
      interaction._lastUpdate = payload;
      return payload;
    }),
  };

  return interaction;
}

export function makeButtonInteraction({
  customId,
  guildId = 'g1',
  channelId = 'c1',
  userId = 'u1',
  channel = null,
} = {}) {
  const i = makeChatInteraction({ guildId, channelId, userId, channel });
  i.customId = customId;
  i.isChatInputCommand = () => false;
  i.isButton = () => true;
  return i;
}
