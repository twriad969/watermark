const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const axios = require('axios');
const { URLSearchParams } = require('url');
require('dotenv').config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
let markRatio = '0.4';
let header = '';
let footer = '';
let recentImages = [];
let processedCount = 0;
let channels = [];

bot.start((ctx) => ctx.reply('Hello! Send me a photo and I will watermark it for you.'));

const watermarkImage = async (mainImageUrl, watermarkUrl, ratio) => {
  const params = new URLSearchParams({
    mainImageUrl,
    markImageUrl: watermarkUrl,
    markRatio: ratio,
    position: 'bottomLeft'
  });
  const response = await axios.get(`https://quickchart.io/watermark`, { params, responseType: 'arraybuffer' });
  return Buffer.from(response.data, 'binary');
};

const processPhoto = async (ctx, photo, caption, retry = 3) => {
  try {
    const file = await ctx.telegram.getFileLink(photo.file_id);
    const mainImageUrl = file.href;
    const watermarkUrl = 'https://i.ibb.co/Sd0wFmP/20240731-193646.png';
    const watermarkedImage = await watermarkImage(mainImageUrl, watermarkUrl, markRatio);

    // Check if the caption contains links
    const links = caption ? caption.match(/\bhttps?:\/\/\S+/gi) : null;
    let customCaption = caption;

    if (links) {
      customCaption = `${header ? header + '\n\n' : ''}` +
        `${links.map((link, index) => `👉 v${index + 1} : ${link}`).join('\n\n')}` +
        `${footer ? '\n\n' + footer : ''}`;
    }

    processedCount++;
    return { type: 'photo', media: { source: watermarkedImage }, caption: customCaption };
  } catch (error) {
    console.error(error);
    if (retry > 0) {
      console.log(`Retrying... attempts left: ${retry}`);
      return await processPhoto(ctx, photo, caption, retry - 1);
    } else {
      ctx.reply('Failed to watermark the image.');
      return null;
    }
  }
};

bot.on('photo', async (ctx) => {
  try {
    if (ctx.message.media_group_id) {
      const mediaGroup = ctx.message.media_group_id;
      const photos = ctx.message.photo;
      const caption = ctx.message.caption || '';

      const processedPhotos = await Promise.all(photos.map(photo => processPhoto(ctx, photo, caption)));

      const mediaGroupPhotos = processedPhotos.filter(photo => photo !== null).map(photo => ({
        type: 'photo',
        media: photo.media.source,
        caption: photo.caption
      }));

      if (mediaGroupPhotos.length > 0) {
        await ctx.replyWithMediaGroup(mediaGroupPhotos);
      }
    } else {
      const photo = ctx.message.photo.pop();
      const caption = ctx.message.caption || '';
      const processedPhoto = await processPhoto(ctx, photo, caption);

      if (processedPhoto) {
        await ctx.replyWithPhoto(processedPhoto.media, { caption: processedPhoto.caption });
      }
    }
  } catch (error) {
    console.error('Unhandled error while processing', error);
  }
});

bot.command('mark', (ctx) => {
  const args = ctx.message.text.split(' ');
  if (args.length === 2 && !isNaN(args[1])) {
    markRatio = args[1];
    ctx.reply(`Watermark ratio set to ${markRatio}`);
  } else {
    ctx.reply('Please provide a valid number for the watermark ratio, e.g., /mark 0.6');
  }
});

bot.command('header', (ctx) => {
  const text = ctx.message.text.replace('/header', '').trim();
  header = text;
  ctx.reply(`Header set to: ${header}`);
});

bot.command('footer', (ctx) => {
  const text = ctx.message.text.replace('/footer', '').trim();
  footer = text;
  ctx.reply(`Footer set to: ${footer}`);
});

bot.command('add', (ctx) => {
  const args = ctx.message.text.split(' ');
  if (args.length === 2) {
    const channel = args[1].replace('@', '').trim();
    if (!channels.includes(channel)) {
      channels.push(channel);
      ctx.reply(`Added channel: ${channel}. Please add the bot as an admin to this channel.`);
    } else {
      ctx.reply('This channel is already added.');
    }
  } else {
    ctx.reply('Please provide a valid channel ID or username, e.g., /add your_channel');
  }
});

bot.command('postnow', (ctx) => {
  if (recentImages.length > 0) {
    if (channels.length > 0) {
      const channelButtons = channels.map(channel => Markup.button.callback(channel, `post_${channel}`));
      ctx.reply('Select a channel to post the images:', Markup.inlineKeyboard(channelButtons, { columns: 1 }).resize());
    } else {
      ctx.reply('No channels added. Please add a channel using the /add command.');
    }
  } else {
    ctx.reply('No recent images to post.');
  }
});

bot.command('stats', (ctx) => {
  ctx.reply(`Total images processed: ${processedCount}`);
});

bot.action(/post_(.+)/, async (ctx) => {
  const channel = ctx.match[1];
  if (recentImages.length > 1) {
    await ctx.telegram.sendMediaGroup(`@${channel}`, recentImages);
  } else {
    for (const image of recentImages) {
      await ctx.telegram.sendPhoto(`@${channel}`, image.media, { caption: image.caption });
    }
  }
  recentImages = [];  // Clear recent images after posting
  ctx.reply(`Images have been posted to @${channel}.`);
});

const app = express();

app.get('/', (req, res) => {
  res.send('Bot is running');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  bot.launch();
});
