# Dream Zone Main Bot

Discord bot for Dream Zone server with advanced features including help system, XP tracking, ticket system, and more.

## Features

- 🆘 Advanced Help System with direct voice channel links
- 📊 XP System with voice and message tracking
- 🎫 Ticket System with categories
- 🛒 XP Shop for role purchasing
- 📝 Comprehensive logging system
- ⚙️ Moderation tools (warn, mute, clear)
- 🎉 Giveaway system
- 📋 Staff application system

## Deployment on Render

### Environment Variables Required:
- `TOKEN` - Your Discord bot token
- `staffRoleId` - Staff role ID
- `highStaffRoleId` - High Staff role ID

### Deploy Steps:
1. Fork this repository
2. Connect to Render
3. Set environment variables
4. Deploy!

## Local Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Create `config.json` with your bot token and role IDs
4. Run: `npm start`

## Commands

- `!h [reason]` - Request help (Help channel only)
- `!xp [user]` - Check XP (XP channel only)
- `!shop` - Link to XP shop
- `!clear [amount]` - Clear messages (High Staff only)
- `!say [message]` - Send message as bot (High Staff only)
- `!vt` - Check veteran status (Veteran channel only)
- `!16` - Age verification system

## Slash Commands

- `/addxp` - Add XP to user (Admin)
- `/remxp` - Remove XP from user (Admin)
- `/warn` - Warn user (Staff+)
- `/vcmute` - Voice mute user (Staff+)
- `/chmute` - Channel mute user (Staff+)
- `/giveaway` - Create giveaway (Admin)
- `/staffappsend` - Send staff application form (Admin)

## Support

For support or questions, contact the development team.