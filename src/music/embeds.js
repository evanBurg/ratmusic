import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { formatDuration } from './resolver.js';

export function queueButtons(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('music:skip')
      .setLabel('Skip')
      .setEmoji('⏭️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('music:stop')
      .setLabel('Stop')
      .setEmoji('🛑')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}

export function queueEmbed(music) {
  const embed = new EmbedBuilder().setColor(0x5865f2).setTitle('🎵 Music Queue');

  if (music.current) {
    embed.addFields({
      name: '▶️ Now Playing',
      value: `**${truncate(music.current.title, 200)}** \`[${formatDuration(music.current.durationSec)}]\`\n👤 requested by <@${music.current.requestedBy}>`,
    });
  } else {
    embed.setDescription('💤 Nothing is playing right now.');
  }

  if (music.queue.length > 0) {
    const lines = music.queue.slice(0, 25).map((t, i) => {
      const num = String(i + 1).padStart(2, ' ');
      return `\`${num}.\` **${truncate(t.title, 80)}** \`[${formatDuration(t.durationSec)}]\` — <@${t.requestedBy}>`;
    });
    let value = lines.join('\n');
    if (music.queue.length > 25) {
      value += `\n…and **${music.queue.length - 25}** more.`;
    }
    embed.addFields({ name: `⏭️ Up Next (${music.queue.length})`, value });

    const totalSec = music.queue.reduce((a, t) => a + (t.durationSec || 0), 0);
    if (totalSec > 0) {
      embed.setFooter({ text: `⏱️ Total queue length: ${formatDuration(totalSec)}` });
    }
  } else if (music.current) {
    embed.addFields({ name: '⏭️ Up Next', value: '_(empty)_' });
  }

  return embed;
}

function truncate(s, n) {
  s = String(s);
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}
