const Anthropic = require('@anthropic-ai/sdk');

// Промпт для генерации отчёта (все 4 эксперта + объединение)
const MASTER_PROMPT = `Вы — команда из 4 AI экспертов McKinsey, которая анализирует малый бизнес и создаёт детальный отчёт.

Ваши роли:
1. Business Analyst (15+ лет опыта) — диагностика проблем и возможностей
2. CFO (12 лет опыта) — финансовый анализ и unit-экономика
3. Marketing Expert (10 лет опыта) — маркетинговая стратегия
4. COO (14 лет опыта) — операционная эффективность

На основе данных клиента создайте ЕДИНЫЙ структурированный отчёт на 10-12 страниц:

## СТРУКТУРА ОТЧЁТА:

# AI БИЗНЕС-АНАЛИЗ
**[Название компании]**
Дата: [текущая дата]

---

## 1. EXECUTIVE SUMMARY (1 страница)
- 3-5 ключевых выводов
- Главная проблема бизнеса
- Главная упущенная возможность
- Прогноз: без изменений vs с рекомендациями

## 2. BUSINESS HEALTH SCORE
Оценка по 5 метрикам (1-10):
- Финансовое здоровье
- Операционная эффективность
- Маркетинг и продажи
- Готовность к масштабированию
- Общий балл

## 3. ТОП-3 QUICK WINS (1 страница)
Три действия с максимальным ROI:
- Действие, ожидаемый результат в ₽, срок

## 4. ФИНАНСОВЫЙ АНАЛИЗ (2 страницы)
- Unit-экономика с формулами
- Денежные дыры
- Прогноз на 90 дней

## 5. МАРКЕТИНГОВАЯ СТРАТЕГИЯ (2 страницы)
- Анализ текущих каналов
- Рекомендуемые каналы с конкретными действиями
- Распределение бюджета

## 6. 90-ДНЕВНЫЙ ПЛАН (2 страницы)
По неделям: что делать, кто ответственный

## 7. ИНСТРУМЕНТЫ И РЕСУРСЫ (1 страница)
Конкретные инструменты с ценами и ссылками

## 8. МЕТРИКИ ДЛЯ ОТСЛЕЖИВАНИЯ (1 страница)
KPI которые нужно измерять еженедельно

## 9. NEXT STEPS (1 страница)
Что делать завтра, на этой неделе

---

ПРАВИЛА:
- Простой язык (уровень 8 класса)
- Каждая рекомендация = конкретное действие + ожидаемый результат в ₽
- Если данных недостаточно — явно указывать
- Все расчёты показывать с формулами
- Никакого MBA-жаргона без объяснения

ДАННЫЕ КЛИЕНТА:
`;

// Функция отправки email через Resend или другой сервис
async function sendEmail(to, subject, htmlContent, pdfBuffer) {
  // Используем Resend API (бесплатно 100 писем/месяц)
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'AI Business Analyzer <reports@' + (process.env.RESEND_DOMAIN || 'resend.dev') + '>',
      to: [to],
      subject: subject,
      html: htmlContent,
      // Для PDF нужен платный план Resend, пока отправляем HTML
    }),
  });

  return response.ok;
}

// Конвертация Markdown в HTML
function markdownToHtml(markdown) {
  return markdown
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*)\*/gim, '<em>$1</em>')
    .replace(/^\* (.*$)/gim, '<li>$1</li>')
    .replace(/^• (.*$)/gim, '<li>$1</li>')
    .replace(/\n/gim, '<br>');
}

// Основной обработчик
module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const formData = req.body;

    // Проверяем обязательные поля
    if (!formData.email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Форматируем данные клиента для промпта
    const clientData = Object.entries(formData)
      .filter(([key]) => !key.startsWith('_')) // Убираем служебные поля FormSubmit
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');

    // Инициализируем Anthropic
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Генерируем отчёт
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: MASTER_PROMPT + clientData,
        },
      ],
    });

    const reportMarkdown = message.content[0].text;
    const reportHtml = markdownToHtml(reportMarkdown);

    // Формируем красивое письмо
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px; }
    h2 { color: #1e40af; margin-top: 30px; }
    h3 { color: #3b82f6; }
    strong { color: #1f2937; }
    li { margin: 5px 0; }
    .header { background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%); color: white; padding: 30px; border-radius: 10px; margin-bottom: 30px; }
    .header h1 { color: white; border: none; margin: 0; }
    .footer { background: #f3f4f6; padding: 20px; border-radius: 10px; margin-top: 30px; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <h1>🎯 Ваш AI Бизнес-Анализ готов!</h1>
    <p>Персональный отчёт от команды AI экспертов</p>
  </div>

  ${reportHtml}

  <div class="footer">
    <p><strong>Есть вопросы?</strong> Ответьте на это письмо.</p>
    <p>AI Business Analyzer</p>
  </div>
</body>
</html>
    `;

    // Отправляем email клиенту
    const clientEmail = formData.email || formData['Email для отчёта'] || formData['email_for_report'];
    const companyName = formData['Название компании'] || formData['company_name'] || 'Ваша компания';

    if (clientEmail && process.env.RESEND_API_KEY) {
      await sendEmail(
        clientEmail,
        `✅ Ваш AI Бизнес-Анализ готов - ${companyName}`,
        emailHtml
      );
    }

    // Также отправляем уведомление владельцу (вам)
    if (process.env.OWNER_EMAIL && process.env.RESEND_API_KEY) {
      await sendEmail(
        process.env.OWNER_EMAIL,
        `📊 Отчёт отправлен: ${companyName}`,
        `<h2>Отчёт отправлен клиенту: ${clientEmail}</h2><hr>${emailHtml}`
      );
    }

    return res.status(200).json({
      success: true,
      message: 'Report generated and sent',
      reportPreview: reportMarkdown.substring(0, 500) + '...'
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      error: 'Failed to generate report',
      details: error.message
    });
  }
};
