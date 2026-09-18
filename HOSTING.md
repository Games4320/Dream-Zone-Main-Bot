# הוראות הגדרה בחינם 24/7

## שלב 1: העלה ל-GitHub

1. עבור ל- https://github.com/new
2. בחר שם למאגר: `superme-official-bot`
3. בחר "Public"
4. לחץ "Create repository"
5. בשורת הפקודה:

```bash
git remote add origin https://github.com/YOUR_USERNAME/superme-official-bot.git
git branch -M main
git push -u origin main
```

⚠️ **אתה צריך להסיר את `config.json` מ-GitHub:**

```bash
git rm --cached config.json
git commit -m "Remove config.json"
git push
```

## שלב 2: Railway.app (ההפתרון הטוב ביותר)

Railway מציע 5$ בחודש בחינם - מספיק עבור בוט Discord!

1. עבור ל- https://railway.app
2. התחבר עם GitHub
3. בחר "New Project"
4. בחר "Deploy from GitHub repo"
5. בחר את `superme-official-bot`
6. הגדר משתנה סביבה:
   - **TOKEN** = `[הטוקן שלך]`
   - **staffRoleId** = `1541492934329761880`
   - **highStaffRoleId** = `1541492934376165398`

7. ערוך את `index.js` כדי לקרוא מ-process.env במקום config.json:

```javascript
const token = process.env.TOKEN;
const staffRoleId = process.env.staffRoleId;
const highStaffRoleId = process.env.highStaffRoleId;
```

8. עדכן את `package.json`:

```json
{
  "name": "superme-bot",
  "version": "1.0.0",
  "description": "Discord Bot",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "discord.js": "^14.16.0"
  }
}
```

## שלב 3: הגדרת המשתנים

בחדר Railway ב-"Variables":

```
TOKEN=YOUR_BOT_TOKEN_HERE
staffRoleId=1541492934329761880
highStaffRoleId=1541492934376165398
```

**כדי לקבל את הטוקן שלך:**
1. עבור ל- https://discord.com/developers/applications
2. בחר את הטיקוט שלך
3. לך ל-"Bot" בצד שמאל
4. לחץ "Reset Token"
5. העתק את הטוקן החדש

## שלב 4: Deploy

Railway יגדיר ויורץ את הבוט באופן אוטומטי! 🚀

## אפשרויות נוספות בחינם:

### Replit.com (מוגבל אבל חינם לחלוטין):
- עבור ל- https://replit.com
- בחר "Import from GitHub"
- בחר את המאגר שלך
- הגדר `.env`:
```
TOKEN=...
```

### Heroku (כבר לא בחינם, אבל עדיין דרך אחת):
- ~~עבור ל- https://www.heroku.com~~
- Heroku הפסיקה את השירות החינם

## סיכום:
**Railway.app** = ✅ המומלץ ביותר
- 5$ חינם בחודש (מספיק!)
- 24/7 uptime
- שילוב GitHub קל
- ממשק משתמש נוח
