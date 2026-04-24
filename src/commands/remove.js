import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { getMusic } from '../music/manager.js';

export const data = new SlashCommandBuilder()
  .setName('remove')
  .setDescription('Remove an item or range from the queue')
  .addStringOption((o) =>
    o.setName('selector')
      .setDescription('Single position (e.g. "3") or inclusive range (e.g. "1-7")')
      .setRequired(true),
  );

export async function execute(interaction) {
  const sel = interaction.options.getString('selector', true).trim();
  const music = getMusic(interaction.guildId);

  if (music.queue.length === 0) {
    return interaction.reply({ content: 'The queue is empty.', flags: MessageFlags.Ephemeral });
  }

  const rangeMatch = sel.match(/^(\d+)\s*-\s*(\d+)$/);
  const singleMatch = sel.match(/^(\d+)$/);

  if (singleMatch) {
    const idx = parseInt(singleMatch[1], 10);
    const removed = music.removeIndex(idx);
    if (!removed) {
      return interaction.reply({ content: `No item at position **${idx}** (queue size: ${music.queue.length + 1}).`, flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({ content: `Removed **#${idx}**: ${escapeMd(removed.title)}` });
  }

  if (rangeMatch) {
    let a = parseInt(rangeMatch[1], 10);
    let b = parseInt(rangeMatch[2], 10);
    if (a > b) [a, b] = [b, a];
    const removed = music.removeRange(a, b);
    if (removed.length === 0) {
      return interaction.reply({ content: `Nothing in range **${a}-${b}** to remove.`, flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({
      content: `Removed **${removed.length}** item(s) from positions **${a}-${b}**.`,
    });
  }

  return interaction.reply({
    content: 'Selector must be a single number (e.g. `3`) or a range (e.g. `1-7`).',
    flags: MessageFlags.Ephemeral,
  });
}

function escapeMd(s) {
  return String(s).replace(/([*_~`>|\\])/g, '\\$1');
}
