import { MessageFlags } from 'discord.js';
import { getMusic } from '../music/manager.js';
import { queueEmbed, queueButtons } from '../music/embeds.js';

export async function handleButton(interaction) {
  if (!interaction.customId.startsWith('music:')) return false;

  const action = interaction.customId.slice('music:'.length);
  const music = getMusic(interaction.guildId);

  if (action === 'skip') {
    if (!music.current && music.queue.length === 0) {
      return interaction.reply({ content: '🤷 Nothing is playing.', flags: MessageFlags.Ephemeral });
    }
    const skipped = music.skip();
    await interaction.update({
      embeds: [queueEmbed(music)],
      components: [queueButtons(!music.current && music.queue.length === 0)],
    });
    if (skipped && interaction.channel) {
      interaction.channel.send({ content: `⏭️ <@${interaction.user.id}> skipped **${escapeMd(skipped.title)}**.` }).catch(() => {});
    }
    return true;
  }

  if (action === 'stop') {
    music.stopAndLeave();
    await interaction.update({
      embeds: [queueEmbed(music)],
      components: [queueButtons(true)],
    });
    if (interaction.channel) {
      interaction.channel.send({ content: `🛑 <@${interaction.user.id}> stopped playback and cleared the queue.` }).catch(() => {});
    }
    return true;
  }

  return interaction.reply({ content: `❓ Unknown action: ${action}`, flags: MessageFlags.Ephemeral });
}

function escapeMd(s) {
  return String(s).replace(/([*_~`>|\\])/g, '\\$1');
}
