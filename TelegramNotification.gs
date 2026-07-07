function sendSatsangNotification() {
  const botToken = '8734687133:AAHTu-P_PAP8YCmjx5t4DkrzFNKdOCYHC8k';
  const chatId = '8277062957';
  const message = '🌿 Satsang for today is ready!\n\nhttps://satsang.satyajeettiwari.online';
  const url = 'https://api.telegram.org/bot' + botToken + '/sendMessage?chat_id=' + chatId + '&text=' + encodeURIComponent(message) + '&parse_mode=HTML';
  UrlFetchApp.fetch(url);
}

function createTrigger() {
  ScriptApp.newTrigger('sendSatsangNotification')
    .timeBased()
    .atHour(12)
    .nearMinute(0)
    .inTimezone('Asia/Kolkata')
    .everyDays(1)
    .create();
}
