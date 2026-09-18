const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, Events, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

// Load from environment variables first, fall back to config.json
let token, staffRoleId, highStaffRoleId;

if (process.env.TOKEN) {
  // Running on Railway or similar
  token = process.env.TOKEN;
  staffRoleId = process.env.staffRoleId;
  highStaffRoleId = process.env.highStaffRoleId;
} else {
  // Running locally
  const config = require('./config.json');
  token = config.token;
  staffRoleId = config.staffRoleId;
  highStaffRoleId = config.highStaffRoleId;
}

const HELP_CHANNEL_ID = '1550239568551485530';
const XP_CHECK_CHANNEL_ID = '1550376830635085926';
const XP_SHOP_CHANNEL_ID = '1550379760792633397';
const TICKET_SETUP_CHANNEL_ID = '1550240301313032222';
const VETERAN_CHANNEL_ID = '1541492936724971558';
const LOGS_CHANNEL_ID = '1541492941795889301';
const AGE_CHECK_ROLE_ID = '1550414404531654727';
const COOLDOWN_DURATION = 30 * 1000;
const XP_PER_MESSAGE = 2;
const XP_PER_VOICE_MINUTE = 4;
const VOICE_XP_INTERVAL = 60000;
const VETERAN_DAYS = 85;

const MANAGEMENT_ROLE_ID = '1541492934405398528';
const SPECIALIST_ROLE_ID = '1541492934376165400';

// Ticket categories
const TICKET_CATEGORIES = [
  { id: 'server_team_exam', label: 'בחינה לצוות השרת', allowedRoles: [staffRoleId, highStaffRoleId, SPECIALIST_ROLE_ID] },
  { id: 'report_staff', label: 'דיווח על איש צוות', allowedRoles: [staffRoleId, highStaffRoleId] },
  { id: 'complaint_member', label: 'תלונה על ממבר', allowedRoles: [staffRoleId, highStaffRoleId] },
  { id: 'general_question', label: 'שאלה כללית', allowedRoles: [staffRoleId, highStaffRoleId] },
  { id: 'other', label: 'אחר', allowedRoles: [staffRoleId, highStaffRoleId] },
  { id: 'management_appeal', label: 'פנייה להנהלה', allowedRoles: [MANAGEMENT_ROLE_ID] }
];

const SHOP_ROLES = [
  { roleId: '1541492934258720935', cost: 10000 },
  { roleId: '1541492934258720936', cost: 15000 },
  { roleId: '1541492934258720937', cost: 20000 },
  { roleId: '1541492934258720938', cost: 25000 },
  { roleId: '1541492934258720939', cost: 30000 }
];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages
  ]
});

const helpClaims = new Map();
const cooldowns = new Map();
const userXP = new Map();
const voiceSessions = new Map();
const purchasedRoles = new Map();
const openTickets = new Map();
const ageCheckClaims = new Map(); // Track age check claims
const messageTimestamps = new Map(); // Track messages per user for spam detection
let ticketCategoryId = null;
let autoRoleId = null; // Store the auto-role ID

const SPAM_THRESHOLD = 5; // 5 messages
const SPAM_TIME_WINDOW = 5000; // in 5 seconds
const MANAGER_ROLE_ID = '1541492934405398535';

// Helper function to send logs
async function sendLog(title, description, color = 0x0099FF) {
  try {
    const logsChannel = client.channels.cache.get(LOGS_CHANNEL_ID);
    if (logsChannel) {
      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();
      await logsChannel.send({ embeds: [embed] });
      console.log(`✅ Log sent: ${title}`);
    } else {
      console.error('Logs channel not found in cache');
    }
  } catch (err) {
    console.error('Failed to send log:', err);
  }
}

client.once(Events.ClientReady, async () => {
  console.log(`Bot connected as: ${client.user.tag}`);
  
  try {
    const commands = [
      new SlashCommandBuilder()
        .setName('xpshopsend')
        .setDescription('שלח את ה-XP shop לצאט')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .toJSON(),
      new SlashCommandBuilder()
        .setName('addxp')
        .setDescription('הוסף XP לשחקן')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option => 
          option.setName('user')
            .setDescription('בחר משתמש')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option.setName('amount')
            .setDescription('כמות ה-XP להוספה')
            .setRequired(true)
            .setMinValue(1)
        )
        .toJSON(),
      new SlashCommandBuilder()
        .setName('remxp')
        .setDescription('הסר XP משחקן')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option => 
          option.setName('user')
            .setDescription('בחר משתמש')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option.setName('amount')
            .setDescription('כמות ה-XP להסרה')
            .setRequired(true)
            .setMinValue(1)
        )
        .toJSON(),
      new SlashCommandBuilder()
        .setName('setautoroll')
        .setDescription('הגדר רול אוטומטי לכל משתמש שנכנס')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('בחר רול')
            .setRequired(true)
        )
        .toJSON(),
      new SlashCommandBuilder()
        .setName('cleartickets')
        .setDescription('מחק את כל הטיקטים וסדר מחדש את הקטגוריה')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .toJSON()
    ];

    await client.application.commands.set(commands);
    console.log('✅ Slash commands registered successfully!');
  } catch (err) {
    console.error('❌ Failed to register slash commands:', err);
  }

  try {
    const shopChannel = await client.channels.fetch(XP_SHOP_CHANNEL_ID);
    
    if (shopChannel) {
      const messages = await shopChannel.messages.fetch({ limit: 10 });
      for (const message of messages.values()) {
        if (message.author.id === client.user.id) {
          await message.delete().catch(() => {});
        }
      }

      const embed = new EmbedBuilder()
        .setColor(0xFF6B00)
        .setTitle('# Superme Xp shop');

      let shopText = '**תבחרו את הרול שבא לכם, ותקנו אותו!**\n\n';
      for (let i = 0; i < SHOP_ROLES.length; i++) {
        const roleConfig = SHOP_ROLES[i];
        const roleId = roleConfig.roleId;
        const cost = roleConfig.cost;
        shopText += `${i + 1}. <@&${roleId}> - ${cost} XP\n`;
      }
      shopText += '\n▼ click on the button to buy a role.';
      embed.setDescription(shopText);

      embed.addFields({
        name: '---',
        value: `במידה ויש בעיה בחנות, אתם מוזמנים לפתוח טיקט ב <#${TICKET_SETUP_CHANNEL_ID}>`,
        inline: false
      });

      const buyButtonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('shop_open_buy')
          .setLabel('Open Store')
          .setStyle('Primary')
      );

      const refundButtonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('shop_open_refund')
          .setLabel('Return Roles')
          .setStyle('Secondary')
      );

      await shopChannel.send({ embeds: [embed], components: [buyButtonRow, refundButtonRow] });
      console.log('✅ XP shop sent to channel!');
    }
  } catch (err) {
    console.error('❌ Failed to send shop message:', err);
  }

  try {
    const ticketChannel = await client.channels.fetch(TICKET_SETUP_CHANNEL_ID);
    
    if (ticketChannel) {
      const messages = await ticketChannel.messages.fetch({ limit: 5 });
      for (const message of messages.values()) {
        if (message.author.id === client.user.id && message.embeds.length > 0 && message.embeds[0].title === 'Superme Ticket System') {
          await message.delete().catch(() => {});
        }
      }

      const guild = ticketChannel.guild;
      let category = guild.channels.cache.find(ch => ch.type === ChannelType.GuildCategory && ch.name === '【🏷️】open tickets');
      
      if (!category) {
        category = await guild.channels.create({
          name: '【🏷️】open tickets',
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            {
              id: guild.id,
              deny: [PermissionFlagsBits.ViewChannel],
            }
          ]
        });
        console.log('✅ Ticket category created!');
      }

      ticketCategoryId = category.id;

      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Superme Ticket System')
        .setDescription('בחר קטגוריה כדי לפתוח טיקט');

      const ticketMenu = new StringSelectMenuBuilder()
        .setCustomId('ticket_category_select')
        .setPlaceholder('בחר קטגוריה...')
        .addOptions(
          TICKET_CATEGORIES.map(cat => ({
            label: cat.label,
            value: cat.id,
            description: 'פתח טיקט'
          }))
        );

      const row = new ActionRowBuilder().addComponents(ticketMenu);
      await ticketChannel.send({ embeds: [embed], components: [row] });
      console.log('✅ Ticket system sent to channel!');
    }
  } catch (err) {
    console.error('❌ Failed to send ticket system:', err);
  }
  
  setInterval(() => {
    const now = Date.now();
    voiceSessions.forEach((startTime, userId) => {
      const elapsedMs = now - startTime;
      const elapsedMinutes = Math.floor(elapsedMs / 60000);
      
      if (elapsedMinutes > 0) {
        const xpToAdd = elapsedMinutes * XP_PER_VOICE_MINUTE;
        const currentXp = userXP.get(userId) || 0;
        userXP.set(userId, currentXp + xpToAdd);
        voiceSessions.set(userId, now);
        console.log(`Added ${xpToAdd} XP to ${userId} for voice activity`);
      }
    });
  }, VOICE_XP_INTERVAL);
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'xpshopsend') {
      try {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});

        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          await interaction.editReply({ content: 'רק אדמינים יכולים להשתמש בפקודה הזו.' });
          return;
        }

        const shopChannel = await client.channels.fetch(XP_SHOP_CHANNEL_ID);
        
        if (shopChannel) {
          const messages = await shopChannel.messages.fetch({ limit: 10 });
          for (const message of messages.values()) {
            if (message.author.id === client.user.id) {
              await message.delete().catch(() => {});
            }
          }

          const embed = new EmbedBuilder()
            .setColor(0xFF6B00)
            .setTitle('# Superme Xp shop');

          let shopText = '**תבחרו את הרול שבא לכם, ותקנו אותו!**\n\n';
          for (let i = 0; i < SHOP_ROLES.length; i++) {
            const roleConfig = SHOP_ROLES[i];
            const roleId = roleConfig.roleId;
            const cost = roleConfig.cost;
            shopText += `${i + 1}. <@&${roleId}> - ${cost} XP\n`;
          }
          shopText += '\n▼ click on the button to buy a role.';
          embed.setDescription(shopText);

          embed.addFields({
            name: '---',
            value: `במידה ויש בעיה בחנות, אתם מוזמנים לפתוח טיקט ב <#${TICKET_SETUP_CHANNEL_ID}>`,
            inline: false
          });

          const buyButtonRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('shop_open_buy')
              .setLabel('Open Store')
              .setStyle('Primary')
          );

          const refundButtonRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('shop_open_refund')
              .setLabel('Return Roles')
              .setStyle('Secondary')
          );

          await shopChannel.send({ embeds: [embed], components: [buyButtonRow, refundButtonRow] });
          await interaction.editReply({ content: '✅ ה-XP shop נשלח בהצלחה!' });
        }
      } catch (err) {
        console.error('Error in xpshopsend command:', err);
        await interaction.editReply({ content: 'אירעה שגיאה בעת ביצוע הפקודה.' }).catch(() => {});
      }
      return;
    }

    if (interaction.commandName === 'addxp') {
      try {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});

        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          await interaction.editReply({ content: 'רק אדמינים יכולים להשתמש בפקודה הזו.' });
          return;
        }

        const user = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');

        if (amount <= 0) {
          await interaction.editReply({ content: 'הכמות חייבת להיות חיובית.' });
          return;
        }

        const currentXp = userXP.get(user.id) || 0;
        userXP.set(user.id, currentXp + amount);

        // Log addxp command
        await sendLog(
          '➕ הוספת XP',
          `**משתמש שביצע:** <@${interaction.user.id}>\n**משתמש שקיבל:** <@${user.id}>\n**כמות XP:** ${amount}\n**XP חדש:** ${currentXp + amount}`,
          0x2ECC71
        );

        await interaction.editReply({ content: `✅ נוסף ${amount} XP ל-<@${user.id}>! XP כללי: ${currentXp + amount}` });
      } catch (err) {
        console.error('Error in addxp command:', err);
        await interaction.editReply({ content: 'אירעה שגיאה בעת ביצוע הפקודה.' }).catch(() => {});
      }
      return;
    }

    if (interaction.commandName === 'remxp') {
      try {
        await interaction.deferReply({ ephemeral: true }).catch(() => {});

        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          await interaction.editReply({ content: 'רק אדמינים יכולים להשתמש בפקודה הזו.' });
          return;
        }

        const user = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');

        if (amount <= 0) {
          await interaction.editReply({ content: 'הכמות חייבת להיות חיובית.' });
          return;
        }

        const currentXp = userXP.get(user.id) || 0;
        const newXp = Math.max(0, currentXp - amount);
        userXP.set(user.id, newXp);

        // Log remxp command
        await sendLog(
          '➖ הסרת XP',
          `**משתמש שביצע:** <@${interaction.user.id}>\n**משתמש שהורד:** <@${user.id}>\n**כמות XP:** ${amount}\n**XP חדש:** ${newXp}`,
          0xE74C3C
        );

        await interaction.editReply({ content: `✅ הוסר ${amount} XP מ-<@${user.id}>! XP כללי: ${newXp}` });
      } catch (err) {
        console.error('Error in remxp command:', err);
        await interaction.editReply({ content: 'אירעה שגיאה בעת ביצוע הפקודה.' }).catch(() => {});
      }
      return;
    }

    if (interaction.commandName === 'setautoroll') {
      try {
        await interaction.deferReply({ ephemeral: true });

        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          await interaction.editReply({ content: 'רק אדמינים יכולים להשתמש בפקודה הזו.' });
          return;
        }

        const role = interaction.options.getRole('role');
        autoRoleId = role.id;

        // Log auto role set
        await sendLog(
          '⚙️ הגדרת רול אוטומטי',
          `**משתמש שביצע:** <@${interaction.user.id}>\n**רול:** <@&${role.id}>`,
          0x3498DB
        );

        await interaction.editReply({ content: `✅ רול אוטומטי הוגדר ל- <@&${role.id}>! כל משתמש שנכנס יקבל אותו.` });
      } catch (err) {
        console.error('Error in setautoroll command:', err);
        await interaction.editReply({ content: 'אירעה שגיאה בעת ביצוע הפקודה.' }).catch(() => {});
      }
      return;
    }

    if (interaction.commandName === 'cleartickets') {
      try {
        await interaction.deferReply({ ephemeral: true });

        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          await interaction.editReply({ content: 'רק אדמינים יכולים להשתמש בפקודה הזו.' });
          return;
        }

        const guild = interaction.guild;
        let deletedCount = 0;

        // Delete all ticket channels
        for (const [channelId, ticketData] of openTickets.entries()) {
          try {
            const channel = await guild.channels.fetch(channelId);
            if (channel) {
              await channel.delete();
              deletedCount++;
            }
          } catch (err) {
            console.error(`Failed to delete ticket channel ${channelId}:`, err);
          }
        }

        // Delete and recreate the ticket category
        const oldCategory = await guild.channels.fetch(ticketCategoryId).catch(() => null);
        if (oldCategory) {
          try {
            await oldCategory.delete();
            console.log('Old ticket category deleted');
          } catch (err) {
            console.error('Failed to delete old category:', err);
          }
        }

        // Create new category at the top
        try {
          const newCategory = await guild.channels.create({
            name: '【🏷️】open tickets',
            type: ChannelType.GuildCategory,
            position: 0, // Set to top
            permissionOverwrites: [
              {
                id: guild.id,
                deny: [PermissionFlagsBits.ViewChannel],
              }
            ]
          });

          ticketCategoryId = newCategory.id;
          openTickets.clear();

          await sendLog(
            '🗑️ מחיקת כל הטיקטים',
            `**משתמש:** <@${interaction.user.id}>\n**טיקטים שנמחקו:** ${deletedCount}\n**קטגוריה חדשה נוצרה בעמדה הגבוהה ביותר**`,
            0xFF0000
          );

          await interaction.editReply({ content: `✅ נמחקו ${deletedCount} טיקטים! הקטגוריה סודרה מחדש בעמדה הגבוהה ביותר.` });
        } catch (err) {
          console.error('Failed to create new category:', err);
          await interaction.editReply({ content: '❌ אירעה שגיאה ביצירת הקטגוריה החדשה.' }).catch(() => {});
        }
      } catch (err) {
        console.error('Error in cleartickets command:', err);
        await interaction.editReply({ content: 'אירעה שגיאה בעת ביצוע הפקודה.' }).catch(() => {});
      }
      return;
    }
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'ticket_category_select') {
      await interaction.deferReply({ ephemeral: true }).catch(() => {});

      const categoryId = interaction.values[0];
      const category = TICKET_CATEGORIES.find(c => c.id === categoryId);
      
      if (!category) {
        await interaction.editReply({ content: 'קטגוריה לא קיימת.' });
        return;
      }

      const guild = interaction.guild;
      const userId = interaction.user.id;
      const member = await guild.members.fetch(userId);
      const username = member.user.username;
      const categoryLabel = category.label;

      // Check if user already has an open ticket
      let userHasOpenTicket = false;
      for (const [channelId, ticketData] of openTickets.entries()) {
        if (ticketData.userId === userId) {
          userHasOpenTicket = true;
          await interaction.editReply({ content: `❌ אתה כבר יש לך טיקט פתוח! <#${channelId}>` });
          break;
        }
      }

      if (userHasOpenTicket) return;

      const ticketName = `${categoryLabel}-${username}`;

      try {
        const ticketChannel = await guild.channels.create({
          name: ticketName,
          type: ChannelType.GuildText,
          parent: ticketCategoryId,
          permissionOverwrites: [
            {
              id: guild.id,
              deny: [PermissionFlagsBits.ViewChannel],
            },
            {
              id: userId,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
            },
          ],
        });

        for (const roleId of category.allowedRoles) {
          await ticketChannel.permissionOverwrites.create(roleId, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
          });
        }

        const staffRole = await guild.roles.fetch(staffRoleId).catch(() => null);
        const highStaffRole = await guild.roles.fetch(highStaffRoleId).catch(() => null);
        
        const embed = new EmbedBuilder()
          .setColor(0x0099FF)
          .setTitle('טיקט חדש')
          .setDescription(`שלום! בקרוב צוות השרת יקח את פנייתך!`);

        const claimButton = new ButtonBuilder()
          .setCustomId(`ticket_claim_${ticketChannel.id}`)
          .setLabel('Claim')
          .setStyle('Success');

        const addButton = new ButtonBuilder()
          .setCustomId(`ticket_add_user_${ticketChannel.id}`)
          .setLabel('הוספת שחקן')
          .setStyle('Primary');

        const removeButton = new ButtonBuilder()
          .setCustomId(`ticket_remove_user_${ticketChannel.id}`)
          .setLabel('הסרת שחקן')
          .setStyle('Danger');

        const closeButton = new ButtonBuilder()
          .setCustomId(`ticket_close_${ticketChannel.id}`)
          .setLabel('סגור טיקט')
          .setStyle('Danger');

        const row = new ActionRowBuilder().addComponents(claimButton, addButton, removeButton, closeButton);

        let mentionText = '';
        if (staffRole) mentionText += `${staffRole} `;
        if (highStaffRole) mentionText += `${highStaffRole} `;
        mentionText += `<@${userId}>`;

        await ticketChannel.send({ 
          embeds: [embed], 
          components: [row], 
          content: mentionText,
          allowedMentions: { parse: ['users', 'roles'], repliedUser: false }
        });

        openTickets.set(ticketChannel.id, {
          userId: userId,
          channelId: ticketChannel.id,
          claimed: false,
          claimedBy: null,
          participants: [userId],
          category: categoryId
        });

        await interaction.editReply({ content: `✅ טיקט נוצר בהצלחה! <#${ticketChannel.id}>` });
        
        // Log ticket creation
        await sendLog(
          '🎫 טיקט חדש נוצר',
          `**משתמש:** <@${userId}>\n**קטגוריה:** ${categoryLabel}\n**שם הטיקט:** ${ticketName}\n**ערוץ:** <#${ticketChannel.id}>`,
          0x0099FF
        );
      } catch (err) {
        console.error('Failed to create ticket:', err);
        await interaction.editReply({ content: '❌ אירעה שגיאה ביצירת הטיקט.' }).catch(() => {});
      }
      return;
    }

    if (customId === 'shop_buy_menu') {
      await interaction.deferReply({ ephemeral: true }).catch(() => {});

      const roleId = interaction.values[0];
      const userId = interaction.user.id;
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      
      if (!member) {
        await interaction.editReply({ content: 'לא הצלחתי למצוא אותך בשרת.' });
        return;
      }

      const roleConfig = SHOP_ROLES.find(r => r.roleId === roleId);
      if (!roleConfig) {
        await interaction.editReply({ content: 'הרול הזה לא קיים בחנות.' });
        return;
      }

      const userXpAmount = userXP.get(userId) || 0;
      if (userXpAmount < roleConfig.cost) {
        await interaction.editReply({ content: `❌ אין לך מספיק אקספי! אתה צריך ${roleConfig.cost} אקספי וברשותך ${userXpAmount}.` });
        return;
      }

      if (member.roles.cache.has(roleId)) {
        await interaction.editReply({ content: '❌ אתה כבר בעלים של הרול הזה!' });
        return;
      }

      try {
        await member.roles.add(roleId);
        userXP.set(userId, userXpAmount - roleConfig.cost);
        
        if (!purchasedRoles.has(userId)) {
          purchasedRoles.set(userId, new Set());
        }
        purchasedRoles.get(userId).add(roleId);

        await interaction.editReply({ content: `✅ קנית בהצלחה את הרול <@&${roleId}>! הוחסרו ${roleConfig.cost} אקספי. XP שנותר: ${userXpAmount - roleConfig.cost}` });
      } catch (err) {
        console.error('Failed to purchase role:', err);
        await interaction.editReply({ content: '❌ אירעה שגיאה בעת קנייה של הרול.' }).catch(() => {});
      }
      return;
    }

    if (customId === 'shop_refund_menu') {
      await interaction.deferReply({ ephemeral: true }).catch(() => {});

      const roleId = interaction.values[0];
      const userId = interaction.user.id;
      const member = await interaction.guild.members.fetch(userId).catch(() => null);
      
      if (!member) {
        await interaction.editReply({ content: 'לא הצלחתי למצוא אותך בשרת.' });
        return;
      }

      const roleConfig = SHOP_ROLES.find(r => r.roleId === roleId);
      if (!roleConfig) {
        await interaction.editReply({ content: 'הרול הזה לא קיים בחנות.' });
        return;
      }

      if (!member.roles.cache.has(roleId)) {
        await interaction.editReply({ content: '❌ אתה לא בעלים של הרול הזה!' });
        return;
      }

      try {
        await member.roles.remove(roleId);
        
        const userXpAmount = userXP.get(userId) || 0;
        userXP.set(userId, userXpAmount + roleConfig.cost);
        
        if (purchasedRoles.has(userId)) {
          purchasedRoles.get(userId).delete(roleId);
        }

        await interaction.editReply({ content: `✅ החזרת בהצלחה את הרול <@&${roleId}>! קיבלת חזרה ${roleConfig.cost} אקספי. XP כללי: ${userXpAmount + roleConfig.cost}` });
      } catch (err) {
        console.error('Failed to refund role:', err);
        await interaction.editReply({ content: '❌ אירעה שגיאה בעת החזרת הרול.' }).catch(() => {});
      }
      return;
    }
  }

  if (!interaction.isButton() && !interaction.isModalSubmit()) return;

  const customId = interaction.customId;

  // Ticket buttons
  if (customId.startsWith('ticket_claim_')) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const channelId = customId.replace('ticket_claim_', '');
    const ticketData = openTickets.get(channelId);

    if (!ticketData) {
      await interaction.editReply({ content: 'הטיקט לא קיים עוד.' });
      return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    const hasStaffRole = member.roles.cache.has(staffRoleId);
    const hasHighStaffRole = member.roles.cache.has(highStaffRoleId);

    if (!hasStaffRole && !hasHighStaffRole) {
      await interaction.editReply({ content: 'רק Staff ו High Staff יכולים ללחוץ על כפתור זה!' });
      return;
    }

    if (ticketData.claimed) {
      await interaction.editReply({ content: `הטיקט כבר נטויל על ידי <@${ticketData.claimedBy}>.` });
      return;
    }

    ticketData.claimed = true;
    ticketData.claimedBy = interaction.user.id;

    const channel = client.channels.cache.get(channelId);
    if (channel) {
      try {
        const messages = await channel.messages.fetch({ limit: 1 });
        const message = messages.first();
        if (message && message.components.length > 0) {
          const newButton = new ButtonBuilder()
            .setCustomId(`ticket_claim_${channelId}`)
            .setLabel(`נטויל על ידי ${interaction.user.username}`)
            .setStyle('Secondary')
            .setDisabled(true);

          const addButton = new ButtonBuilder()
            .setCustomId(`ticket_add_user_${channelId}`)
            .setLabel('הוספת שחקן')
            .setStyle('Primary');

          const removeButton = new ButtonBuilder()
            .setCustomId(`ticket_remove_user_${channelId}`)
            .setLabel('הסרת שחקן')
            .setStyle('Danger');

          const closeButton = new ButtonBuilder()
            .setCustomId(`ticket_close_${channelId}`)
            .setLabel('סגור טיקט')
            .setStyle('Danger');

          const newRow = new ActionRowBuilder().addComponents(newButton, addButton, removeButton, closeButton);
          await message.edit({ components: [newRow] });
        }
      } catch (err) {
        console.error('Failed to update ticket:', err);
      }
    }

    await interaction.editReply({ content: `✅ טיקט נטויל בהצלחה!` });
    
    // Log ticket claim
    await sendLog(
      '🎯 טיקט נטויל',
      `**נטויל על ידי:** <@${interaction.user.id}>\n**טיקט:** <#${channelId}>`,
      0xFFFF00
    );
    return;
  }

  if (customId.startsWith('ticket_add_user_')) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const channelId = customId.replace('ticket_add_user_', '');
    const member = await interaction.guild.members.fetch(interaction.user.id);
    
    const hasStaffRole = member.roles.cache.has(staffRoleId);
    const hasHighStaffRole = member.roles.cache.has(highStaffRoleId);

    if (!hasStaffRole && !hasHighStaffRole) {
      await interaction.editReply({ content: 'רק Staff ו High Staff יכולים להשתמש בכפתור הזה!' });
      return;
    }
    
    const modal = new ModalBuilder()
      .setCustomId(`ticket_add_modal_${channelId}`)
      .setTitle('הוספת שחקן לטיקט')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('user_input')
            .setLabel('Username או ID')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

    await interaction.showModal(modal);
    return;
  }

  if (customId.startsWith('ticket_remove_user_')) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const channelId = customId.replace('ticket_remove_user_', '');
    const member = await interaction.guild.members.fetch(interaction.user.id);
    
    const hasStaffRole = member.roles.cache.has(staffRoleId);
    const hasHighStaffRole = member.roles.cache.has(highStaffRoleId);

    if (!hasStaffRole && !hasHighStaffRole) {
      await interaction.editReply({ content: 'רק Staff ו High Staff יכולים להשתמש בכפתור הזה!' });
      return;
    }
    
    const modal = new ModalBuilder()
      .setCustomId(`ticket_remove_modal_${channelId}`)
      .setTitle('הסרת שחקן מהטיקט')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('user_input')
            .setLabel('Username או ID')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

    await interaction.showModal(modal);
    return;
  }

  if (customId.startsWith('ticket_close_')) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const channelId = customId.replace('ticket_close_', '');
    const channel = client.channels.cache.get(channelId);
    const member = await interaction.guild.members.fetch(interaction.user.id);
    
    const hasStaffRole = member.roles.cache.has(staffRoleId);
    const hasHighStaffRole = member.roles.cache.has(highStaffRoleId);

    if (!hasStaffRole && !hasHighStaffRole) {
      await interaction.editReply({ content: 'רק Staff ו High Staff יכולים לסגור טיקט!' });
      return;
    }

    try {
      await interaction.editReply({ content: '✅ טיקט נסגר בהצלחה! הערוץ יימחק בעוד 5 שניות...' });
      
      setTimeout(async () => {
        try {
          await channel.delete();
          const ticketData = openTickets.get(channelId);
          if (ticketData) {
            openTickets.delete(channelId);
          }
          console.log(`✅ Ticket ${channelId} closed and deleted`);
          
          // Log ticket closed
          await sendLog(
            '🔒 טיקט סגור',
            `**סגור על ידי:** <@${interaction.user.id}>\n**ID:** ${channelId}`,
            0xFF6600
          );
        } catch (err) {
          console.error('Failed to delete ticket channel:', err);
        }
      }, 5000);
    } catch (err) {
      console.error('Failed to close ticket:', err);
      await interaction.editReply({ content: '❌ אירעה שגיאה בעת סגירת הטיקט.' }).catch(() => {});
    }
    return;
  }

  // Modal submissions for tickets
  if (customId.startsWith('ticket_add_modal_')) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const channelId = customId.replace('ticket_add_modal_', '');
    const userInput = interaction.fields.getTextInputValue('user_input');
    const channel = client.channels.cache.get(channelId);

    if (!channel) {
      await interaction.editReply({ content: '❌ הערוץ לא קיים.' });
      return;
    }

    try {
      let member = null;
      const guild = channel.guild;

      try {
        member = await guild.members.fetch(userInput);
      } catch (e) {
        const members = await guild.members.search({ query: userInput, limit: 1 });
        if (members.size > 0) {
          member = members.first();
        }
      }

      if (!member) {
        await interaction.editReply({ content: '❌ לא מצאתי את המשתמש הזה.' });
        return;
      }

      await channel.permissionOverwrites.create(member.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      });

      const ticketData = openTickets.get(channelId);
      if (ticketData) {
        ticketData.participants.push(member.id);
      }

      await interaction.editReply({ content: `✅ <@${member.id}> נוסף לטיקט בהצלחה!` });
    } catch (err) {
      console.error('Failed to add user:', err);
      await interaction.editReply({ content: '❌ אירעה שגיאה בהוספת המשתמש.' }).catch(() => {});
    }
    
    // Log user added to ticket
    await sendLog(
      '➕ משתמש נוסף לטיקט',
      `**משתמש:** <@${member.id}>\n**נוסף על ידי:** <@${interaction.user.id}>\n**טיקט:** <#${channelId}>`,
      0x00FF00
    );
    return;
  }

  if (customId.startsWith('ticket_remove_modal_')) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const channelId = customId.replace('ticket_remove_modal_', '');
    const userInput = interaction.fields.getTextInputValue('user_input');
    const channel = client.channels.cache.get(channelId);

    if (!channel) {
      await interaction.editReply({ content: '❌ הערוץ לא קיים.' });
      return;
    }

    try {
      let member = null;
      const guild = channel.guild;

      try {
        member = await guild.members.fetch(userInput);
      } catch (e) {
        const members = await guild.members.search({ query: userInput, limit: 1 });
        if (members.size > 0) {
          member = members.first();
        }
      }

      if (!member) {
        await interaction.editReply({ content: '❌ לא מצאתי את המשתמש הזה.' });
        return;
      }

      await channel.permissionOverwrites.delete(member.id);

      const ticketData = openTickets.get(channelId);
      if (ticketData) {
        ticketData.participants = ticketData.participants.filter(id => id !== member.id);
      }

      await interaction.editReply({ content: `✅ <@${member.id}> הוסר מהטיקט בהצלחה!` });
    } catch (err) {
      console.error('Failed to remove user:', err);
      await interaction.editReply({ content: '❌ אירעה שגיאה בהסרת המשתמש.' }).catch(() => {});
    }
    
    // Log user removed from ticket
    await sendLog(
      '➖ משתמש הוסר מטיקט',
      `**משתמש:** <@${member.id}>\n**הוסר על ידי:** <@${interaction.user.id}>\n**טיקט:** <#${channelId}>`,
      0xFF0000
    );
    return;
  }

  // Shop button interactions
  if (customId === 'shop_open_buy') {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const buyMenu = new StringSelectMenuBuilder()
      .setCustomId('shop_buy_menu')
      .setPlaceholder('בחר רול לקנייה...')
      .addOptions(
        SHOP_ROLES.map((roleConfig, index) => ({
          label: `Role ${index + 1}`,
          value: roleConfig.roleId,
          description: `${roleConfig.cost} XP`
        }))
      );

    const row = new ActionRowBuilder().addComponents(buyMenu);
    await interaction.editReply({ components: [row] });
    return;
  }

  if (customId === 'shop_open_refund') {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const refundMenu = new StringSelectMenuBuilder()
      .setCustomId('shop_refund_menu')
      .setPlaceholder('בחר רול להחזרה...')
      .addOptions(
        SHOP_ROLES.map((roleConfig, index) => ({
          label: `Role ${index + 1}`,
          value: roleConfig.roleId,
          description: `Get ${roleConfig.cost} XP back`
        }))
      );

    const row = new ActionRowBuilder().addComponents(refundMenu);
    await interaction.editReply({ components: [row] });
    return;
  }

  // Help system
  if (customId.startsWith('help_claim_')) {
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const messageKey = customId.replace('help_claim_', '');
    const claimData = helpClaims.get(messageKey);

    if (!claimData) {
      await interaction.editReply({ content: 'תבנית המساعדה הזו כבר איננה פעילה.' });
      return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);
    const hasStaffRole = member.roles.cache.has(staffRoleId);
    const hasHighStaffRole = member.roles.cache.has(highStaffRoleId);

    if (!hasStaffRole && !hasHighStaffRole) {
      await interaction.editReply({ content: 'אין לך גישה מתאימה.' });
      return;
    }

    if (claimData.claimed) {
      await interaction.editReply({ content: `בקשה זו כבר מטופלת על ידי <@${claimData.claimedBy}>.` });
      return;
    }

    claimData.claimed = true;
    claimData.claimedBy = interaction.user.id;

    const channel = client.channels.cache.get(claimData.channelId);
    if (channel) {
      try {
        const message = await channel.messages.fetch(claimData.messageId);
        
        const newButton = new ButtonBuilder()
          .setCustomId(`help_claim_${claimData.messageId}`)
          .setLabel(`מטופלת על ידי ${interaction.user.username}`)
          .setStyle('Secondary')
          .setDisabled(true);
        
        const newRow = new ActionRowBuilder().addComponents(newButton);
        await message.edit({ components: [newRow] });
      } catch (err) {
        console.error('Failed to update claim button:', err);
      }
    }

    await interaction.editReply({ content: `מטופלת את בקשת העזרה מ-<@${claimData.userId}>.` });
    return;
  }

  // Age check claim
  if (customId.startsWith('age_check_claim_')) {
    try {
      await interaction.deferReply({ ephemeral: true }).catch(() => {});
    } catch (err) {
      console.error('Failed to defer:', err);
      return;
    }
    
    const messageKey = customId.replace('age_check_claim_', '');
    const claimData = ageCheckClaims.get(messageKey);

    if (!claimData) {
      await interaction.editReply({ content: 'בחינה זו כבר סיימה.' }).catch(() => {});
      return;
    }

    if (claimData.claimed) {
      await interaction.editReply({ content: `בחינה זו כבר טופלה על ידי <@${claimData.claimedBy}>.` }).catch(() => {});
      return;
    }

    claimData.claimed = true;
    claimData.claimedBy = interaction.user.id;

    // Log age check claim
    await sendLog(
      '✅ בחינת 16+ טופלה',
      `**טופלה על ידי:** <@${interaction.user.id}>\n**בחינה של:** <@${claimData.originalUserId}>`,
      0xFF6B00
    );

    await interaction.editReply({ content: `✅ בחינה טופלה! ההודעה נמחקה.` }).catch(() => {});
    
    // Delete DM in background - delete for all members who received it
    setTimeout(async () => {
      for (const [key, data] of ageCheckClaims.entries()) {
        if (key === messageKey && data.dmMessageId) {
          try {
            const member = await interaction.guild.members.fetch(data.memberId);
            const dmChannel = await member.createDM();
            const msgs = await dmChannel.messages.fetch({ limit: 20 });
            for (const msg of msgs.values()) {
              if (msg.id === data.dmMessageId) {
                await msg.delete().catch(() => {});
              }
            }
          } catch (err) {
            console.error('Failed to delete DM:', err);
          }
        }
      }
      ageCheckClaims.delete(messageKey);
    }, 500);
    
    return;
  }
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (newMessage.author.bot) return;
  
  if (oldMessage.content === newMessage.content) return; // No actual change
  
  // Log message edit
  await sendLog(
    '✏️ הודעה נערכה',
    `**משתמש:** <@${newMessage.author.id}>\n**ערוץ:** <#${newMessage.channelId}>\n**תוכן ישן:** ${oldMessage.content.substring(0, 80)}${oldMessage.content.length > 80 ? '...' : ''}\n**תוכן חדש:** ${newMessage.content.substring(0, 80)}${newMessage.content.length > 80 ? '...' : ''}`,
    0xF39C12
  );
});

client.on(Events.MessageDelete, async message => {
  if (message.author.bot) return;
  
  // Log message deletion
  await sendLog(
    '🗑️ הודעה נמחקה',
    `**משתמש:** <@${message.author.id}>\n**ערוץ:** <#${message.channelId}>\n**תוכן:** ${message.content.substring(0, 100)}${message.content.length > 100 ? '...' : ''}`,
    0xE74C3C
  );
});

client.on(Events.GuildMemberAdd, async member => {
  // Log member joined
  await sendLog(
    '✅ משתמש הצטרף לשרת',
    `**משתמש:** <@${member.id}>\n**שם:** ${member.user.username}`,
    0x2ECC71
  );

  // Auto-role assignment
  if (autoRoleId) {
    try {
      const role = await member.guild.roles.fetch(autoRoleId);
      if (role) {
        await member.roles.add(role);
        console.log(`✅ Assigned auto-role ${role.name} to ${member.user.username}`);
        
        await sendLog(
          '🎯 רול אוטומטי הוקצה',
          `**משתמש:** <@${member.id}>\n**רול:** <@&${role.id}>`,
          0x1ABC9C
        );
      }
    } catch (err) {
      console.error('Failed to assign auto-role:', err);
    }
  }
});

client.on(Events.GuildMemberRemove, async member => {
  // Log member left
  await sendLog(
    '❌ משתמש עזב את השרת',
    `**משתמש:** ${member.user.username} (${member.id})`,
    0xE74C3C
  );
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const userId = newState.id;

  if (!oldState.channel && newState.channel) {
    voiceSessions.set(userId, Date.now());
    console.log(`${userId} joined voice channel`);
    
    // Log user joined voice
    sendLog(
      '🎤 משתמש נכנס לשיחה',
      `**משתמש:** <@${userId}>\n**שיחה:** ${newState.channel.name}`,
      0x00FFFF
    );
  }

  if (oldState.channel && !newState.channel) {
    const startTime = voiceSessions.get(userId);
    if (startTime) {
      const elapsedMs = Date.now() - startTime;
      const elapsedMinutes = Math.floor(elapsedMs / 60000);
      
      if (elapsedMinutes > 0) {
        const xpToAdd = elapsedMinutes * XP_PER_VOICE_MINUTE;
        const currentXp = userXP.get(userId) || 0;
        userXP.set(userId, currentXp + xpToAdd);
        console.log(`Added ${xpToAdd} XP to ${userId} for voice (${elapsedMinutes} minutes)`);
      }

      voiceSessions.delete(userId);
    }
    
    // Log user left voice
    sendLog(
      '🔇 משתמש יצא משיחה',
      `**משתמש:** <@${userId}>\n**שיחה:** ${oldState.channel.name}`,
      0xFF00FF
    );
  }
});

client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;

  // Log message creation
  await sendLog(
    '💬 הודעה חדשה',
    `**משתמש:** <@${message.author.id}>\n**ערוץ:** <#${message.channelId}>\n**תוכן:** ${message.content.substring(0, 100)}${message.content.length > 100 ? '...' : ''}`,
    0x3498DB
  );

  // XP system - message XP
  if (message.channelId === XP_CHECK_CHANNEL_ID) {
    // This is the XP check channel, don't give XP here
    return;
  }

  const userId = message.author.id;
  const currentXp = userXP.get(userId) || 0;
  userXP.set(userId, currentXp + XP_PER_MESSAGE);
  console.log(`Added ${XP_PER_MESSAGE} XP to ${userId} for message`);

  // Moderation: Spam detection
  if (!messageTimestamps.has(userId)) {
    messageTimestamps.set(userId, []);
  }

  const now = Date.now();
  const userMessages = messageTimestamps.get(userId);
  
  // Remove old timestamps outside the time window
  const recentMessages = userMessages.filter(timestamp => now - timestamp < SPAM_TIME_WINDOW);
  recentMessages.push(now);
  messageTimestamps.set(userId, recentMessages);

  if (recentMessages.length > SPAM_THRESHOLD) {
    try {
      await message.delete();
      const warning = await message.channel.send(`<@${userId}> בבקשה לא להספים! הודעה שלך נמחקה.`);
      
      // Log spam detection
      await sendLog(
        '🚫 זיהוי ספאם',
        `**משתמש:** <@${userId}>\n**הודעות:** ${recentMessages.length}\n**ערוץ:** <#${message.channelId}>`,
        0xFF0000
      );
      
      setTimeout(async () => {
        try {
          await warning.delete();
        } catch (err) {
          console.error('Failed to delete warning:', err);
        }
      }, 5000);

      messageTimestamps.set(userId, []);
      console.log(`Spam detected from ${userId}`);
    } catch (err) {
      console.error('Failed to delete spam message:', err);
    }
    return;
  }

  // Moderation: Manager role mention check
  if (message.mentions.roles.size > 0) {
    const hasManagedMention = message.mentions.roles.some(role => role.id === MANAGER_ROLE_ID);
    
    if (hasManagedMention) {
      try {
        await message.delete();
        const warning = await message.channel.send(`<@${userId}> בבקשה לא לתייג את המנהל!`);
        
        // Log manager mention attempt
        await sendLog(
          '🛑 ניסיון תיוג מנהל',
          `**משתמש:** <@${userId}>\n**ערוץ:** <#${message.channelId}>`,
          0xFF0000
        );
        
        setTimeout(async () => {
          try {
            await warning.delete();
          } catch (err) {
            console.error('Failed to delete manager mention warning:', err);
          }
        }, 5000);

        console.log(`Manager mention attempt from ${userId}`);
      } catch (err) {
        console.error('Failed to delete manager mention message:', err);
      }
      return;
    }
  }

  // Help system
  if (message.content.startsWith('!h')) {
    if (message.channelId !== HELP_CHANNEL_ID) {
      await sendLog(
        '❌ פקודה בחדר לא תקין',
        `**משתמש:** <@${userId}>\n**פקודה:** !h\n**ערוץ:** <#${message.channelId}>\n**הודעה:** לא בחדר הנכון`,
        0xFF6600
      );
      return message.reply(`הפקודה אפשרית רק ב <#${HELP_CHANNEL_ID}> בחדר`);
    }

    const now = Date.now();
    const userCooldown = cooldowns.get(userId);

    const member = await message.guild.members.fetch(userId);
    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

    if (userCooldown && !isAdmin) {
      const timeRemaining = Math.ceil((userCooldown + COOLDOWN_DURATION - now) / 1000);
      return message.reply(`⏱️ חכה ${timeRemaining} שניות לפני שתוכל להשתמש בפקודה שוב.`);
    }

    cooldowns.set(userId, now);

    const args = message.content.slice(2).trim();
    const reason = args || 'אין סיבה';
    
    let voiceChannelLink = 'המשתמש לא נמצא בשיחה!';
    if (message.member.voice.channel) {
      voiceChannelLink = `https://discord.com/channels/${message.guildId}/${message.member.voice.channelId}`;
    }

    try {
      const embed = new EmbedBuilder()
        .setColor(0xFF6B00)
        .setTitle('בקשת עזרה חדשה')
        .addFields(
          { name: 'סיבה:', value: reason, inline: true },
          { name: 'שיחה:', value: voiceChannelLink, inline: true }
        );

      const claimButton = new ButtonBuilder()
        .setCustomId(`help_claim_${message.id}`)
        .setLabel('Claim')
        .setStyle('Success');

      const row = new ActionRowBuilder().addComponents(claimButton);

      const helpMsg = await message.channel.send({
        embeds: [embed],
        content: `<@&${staffRoleId}> <@&${highStaffRoleId}> <@${userId}>`,
        components: [row],
        allowedMentions: { parse: ['roles', 'users'] }
      });

      helpClaims.set(message.id, {
        userId: userId,
        channelId: message.channelId,
        messageId: helpMsg.id,
        claimed: false,
        claimedBy: null
      });

      // Log help request
      await sendLog(
        '🆘 בקשת עזרה חדשה',
        `**משתמש:** <@${userId}>\n**סיבה:** ${reason}\n**ערוץ:** <#${message.channelId}>`,
        0xFFFF00
      );

      setTimeout(() => {
        helpClaims.delete(message.id);
      }, 30000);
    } catch (err) {
      console.error('Failed to create help request:', err);
      message.reply('❌ אירעה שגיאה בעת ביצוע הפקודה.');
    }
    return;
  }

  // XP check command
  if (message.content.startsWith('!xp')) {
    console.log(`🔍 !xp command detected from ${message.author.id} in channel ${message.channelId}`);
    
    if (message.channelId !== XP_CHECK_CHANNEL_ID) {
      console.log(`❌ Wrong channel. Expected ${XP_CHECK_CHANNEL_ID}, got ${message.channelId}`);
      await sendLog(
        '❌ פקודה בחדר לא תקין',
        `**משתמש:** <@${userId}>\n**פקודה:** !xp\n**ערוץ:** <#${message.channelId}>`,
        0xFF6600
      );
      return message.reply(`הפקודה אפשרית רק ב <#${XP_CHECK_CHANNEL_ID}> בחדר`);
    }

    const args = message.content.slice(3).trim();
    let targetId = message.author.id;

    if (args) {
      if (message.mentions.has(args)) {
        targetId = message.mentions.first().id;
      } else if (/^\d+$/.test(args)) {
        targetId = args;
      } else {
        try {
          const members = await message.guild.members.search({ query: args, limit: 1 });
          if (members.size > 0) {
            targetId = members.first().id;
          } else {
            return message.reply('❌ לא מצאתי את המשתמש הזה.');
          }
        } catch (err) {
          return message.reply('❌ אירעה שגיאה בחיפוש המשתמש.');
        }
      }
    }

    const xpAmount = userXP.get(targetId) || 0;
    const user = await client.users.fetch(targetId).catch(() => null);
    const username = user ? user.username : 'Unknown User';

    console.log(`✅ !xp command: ${username} has ${xpAmount} XP`);

    // Log XP check
    await sendLog(
      '📊 בדיקת XP',
      `**משתמש שבדק:** <@${userId}>\n**בדיקה של:** <@${targetId}>\n**XP:** ${xpAmount}`,
      0x9B59B6
    );

    message.reply(`${username} Has ${xpAmount} xp.`);
    return;
  }

  // Shop command
  if (message.content === '!shop') {
    try {
      // Log shop command
      await sendLog(
        '🛒 פקודת חנות',
        `**משתמש:** <@${userId}>\n**ערוץ:** <#${message.channelId}>`,
        0x1ABC9C
      );
      
      message.reply(`🛒 חנות נמצאת כאן: <#${XP_SHOP_CHANNEL_ID}>`);
    } catch (err) {
      console.error('Failed to send shop link:', err);
    }
  }

  // Clear command
  if (message.content.startsWith('!clear')) {
    const member = await message.guild.members.fetch(message.author.id);
    const isHighStaff = member.roles.cache.has(highStaffRoleId);

    if (!isHighStaff) {
      await sendLog(
        '🚫 ניסיון כניסה לא מורשה',
        `**משתמש:** <@${userId}>\n**פקודה:** !clear\n**ערוץ:** <#${message.channelId}>\n**סיבה:** אין הרשאות`,
        0xFF0000
      );
      return; // No response, just silently ignore
    }

    const args = message.content.slice(6).trim();
    const amount = parseInt(args);

    if (isNaN(amount) || amount < 1 || amount > 100) {
      return message.reply('❌ בבקשה בחר מספר בין 1 ל-100.');
    }

    try {
      await message.channel.bulkDelete(amount + 1, true); // +1 to include the command message
      const confirmation = await message.channel.send(`✅ נמחקו ${amount} הודעות.`);
      
      // Log clear command
      await sendLog(
        '🗑️ מחיקת הודעות',
        `**משתמש:** <@${userId}>\n**כמות:** ${amount}\n**ערוץ:** <#${message.channelId}>`,
        0xE74C3C
      );
      
      setTimeout(async () => {
        try {
          await confirmation.delete();
        } catch (err) {
          console.error('Failed to delete confirmation:', err);
        }
      }, 3000);
    } catch (err) {
      console.error('Failed to clear messages:', err);
      message.reply('❌ אירעה שגיאה בעת מחיקת ההודעות.').then(msg => {
        setTimeout(() => msg.delete().catch(() => {}), 3000);
      });
    }
  }

  // Say command
  if (message.content.startsWith('!say')) {
    const member = await message.guild.members.fetch(message.author.id);
    const isHighStaff = member.roles.cache.has(highStaffRoleId);
    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);

    if (!isHighStaff && !isAdmin) {
      await sendLog(
        '🚫 ניסיון כניסה לא מורשה',
        `**משתמש:** <@${userId}>\n**פקודה:** !say\n**ערוץ:** <#${message.channelId}>\n**סיבה:** אין הרשאות`,
        0xFF0000
      );
      return; // No response, just silently ignore
    }

    const content = message.content.slice(4).trim();
    if (!content) {
      return message.reply('❌ אנא כתוב הודעה אחרי `!say`.').then(msg => {
        setTimeout(() => msg.delete().catch(() => {}), 3000);
      });
    }

    try {
      await message.delete();
      await message.channel.send(content);
      
      // Log say command
      await sendLog(
        '📢 פקודת say',
        `**משתמש:** <@${userId}>\n**ערוץ:** <#${message.channelId}>\n**הודעה:** ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}`,
        0xE67E22
      );
    } catch (err) {
      console.error('Failed to send say message:', err);
    }
  }

  // Veteran check command
  if (message.content.startsWith('!vt')) {
    if (message.channelId !== VETERAN_CHANNEL_ID) {
      await sendLog(
        '❌ פקודה בחדר לא תקין',
        `**משתמש:** <@${userId}>\n**פקודה:** !vt\n**ערוץ:** <#${message.channelId}>`,
        0xFF6600
      );
      return message.reply(`הפקודה אפשרית רק ב <#${VETERAN_CHANNEL_ID}> בחדר`);
    }

    try {
      const member = await message.guild.members.fetch(message.author.id);
      const joinedAt = member.joinedTimestamp;
      const now = Date.now();
      const daysInServer = Math.floor((now - joinedAt) / (1000 * 60 * 60 * 24));
      const isVeteran = daysInServer >= VETERAN_DAYS;

      const embed = new EmbedBuilder()
        .setColor(isVeteran ? 0x00FF00 : 0xFF0000)
        .setTitle('🏅 וטרן - בדיקת תנאי')
        .addFields(
          { name: '👤 משתמש', value: `<@${message.author.id}>`, inline: false },
          { name: '📅 ימים בשרת', value: `${daysInServer} ימים`, inline: false },
          { name: '✅ זכאות', value: isVeteran ? '✅ זכאי לרול וטרן!' : `❌ צריך ${VETERAN_DAYS - daysInServer} ימים נוספים`, inline: false }
        );

      message.reply({ embeds: [embed] });
      
      // Log veteran check
      await sendLog(
        '🏅 בדיקת וטרן',
        `**משתמש:** <@${userId}>\n**ימים בשרת:** ${daysInServer}\n**זכאות:** ${isVeteran ? '✅ כן' : '❌ לא'}`,
        0x3498DB
      );
    } catch (err) {
      console.error('Failed to check veteran status:', err);
      message.reply('❌ אירעה שגיאה בעת בדיקת הסטטוס.');
    }
  }

  // Age check command
  if (message.content.startsWith('!16')) {
    try {
      const guild = message.guild;
      const roleToCheck = await guild.roles.fetch(AGE_CHECK_ROLE_ID).catch(() => null);
      
      if (!roleToCheck) {
        return message.reply('❌ לא מצאתי את הרול הנדרש.');
      }

      // Get all members with the role
      const members = await guild.members.fetch();
      const membersWithRole = members.filter(m => m.roles.cache.has(AGE_CHECK_ROLE_ID));

      if (membersWithRole.size === 0) {
        return message.reply('❌ אין מישהו עם הרול הזה.');
      }

      // Send DM to each member with the role
      let sent = 0;
      for (const member of membersWithRole.values()) {
        try {
          const embed = new EmbedBuilder()
            .setColor(0xFF6B00)
            .setTitle('# בחינת 16+ חדשה!')
            .addFields(
              { name: 'משתמש', value: `${message.author}`, inline: false }
            );

          const claimButton = new ButtonBuilder()
            .setCustomId(`age_check_claim_${message.id}`)
            .setLabel('Claim')
            .setStyle('Success');

          const row = new ActionRowBuilder().addComponents(claimButton);

          const dmMsg = await member.send({ embeds: [embed], components: [row] });
          
          // Store the claim data
          ageCheckClaims.set(message.id, {
            originalUserId: message.author.id,
            dmMessageId: dmMsg.id,
            memberId: member.id,
            claimed: false,
            claimedBy: null
          });

          sent++;
        } catch (err) {
          console.error(`Failed to send DM to ${member.user.tag}:`, err);
        }
      }

      // Log age check
      await sendLog(
        '✅ בחינת 16+ חדשה',
        `**משתמש שביצע:** <@${userId}>\n**הודעות נשלחו ל:** ${sent} חברים`,
        0xFF6B00
      );

      message.reply(`✅ בחינה נשלחה ל-${sent} משתמשים עם הרול!`).then(msg => {
        setTimeout(() => msg.delete().catch(() => {}), 5000);
      });
    } catch (err) {
      console.error('Failed to execute age check:', err);
      message.reply('❌ אירעה שגיאה בעת ביצוע הפקודה.').then(msg => {
        setTimeout(() => msg.delete().catch(() => {}), 5000);
      });
    }
  }
});

client.login(token);

// Listen on a port for Render health checks
const PORT = process.env.PORT || 3000;
require('http').createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot is running');
}).listen(PORT, () => {
  console.log(`Health check server listening on port ${PORT}`);
});
