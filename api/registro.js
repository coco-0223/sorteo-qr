export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { nombre, telefono } = req.body || {};

  if (!nombre || !telefono) {
    return res.status(400).json({ error: 'Nombre y teléfono son requeridos' });
  }

  // Validación horaria en el servidor (Zona horaria Argentina UTC-3)
  const now = new Date();
  const argentinaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
  const hour = argentinaTime.getHours();

  // Si está fuera del horario (8:00 a 20:00), responde con éxito silencioso sin escribir en Sheets
  if (hour < 8 || hour >= 20) {
    return res.status(200).json({ status: 'success', note: 'outside_window' });
  }

  try {
    const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
    const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1J6iRiS4gJqOYryypXqrdr_OCvmHGNdGtg6ipS5jKLg4';

    if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
      return res.status(500).json({
        error: 'Faltan variables de entorno en Vercel'
      });
    }

    // 1. Obtener Access Token fresco
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error('Error refreshing token:', tokenData);
      return res.status(500).json({ error: 'Error autenticando con Google' });
    }

    const accessToken = tokenData.access_token;

    // Normalizar teléfono (solo dígitos)
    const cleanPhone = String(telefono).replace(/\D/g, '');

    // Fecha actual de Argentina (formato YYYY-MM-DD para agrupar)
    const argentinaDateStr = argentinaTime.toISOString().slice(0, 10);
    const argentinaTimestamp = argentinaTime.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

    // 2. Leer registros para validar límite en el servidor por teléfono + día
    // Las columnas son: [Nombre, Teléfono, Fecha/Timestamp]
    const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/Sheet1!A:C`;
    const readRes = await fetch(readUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const readData = await readRes.json();
    const rows = readData.values || [];

    // Contar cuántas veces cargó este teléfono hoy
    let todayCount = 0;
    for (const row of rows) {
      const rowPhone = String(row[1] || '').replace(/\D/g, '');
      const rowDate = String(row[2] || '');
      
      if (rowPhone === cleanPhone) {
        // Si tiene fecha registrada y coincide con el día de hoy, o si es formato clásico
        if (rowDate.includes(argentinaDateStr) || rowDate.includes(argentinaTime.toLocaleDateString('es-AR'))) {
          todayCount++;
        }
      }
    }

    // Si ya superó el máximo de 3 por día, simulamos éxito silencioso (no se escribe en Sheets)
    if (todayCount >= 3) {
      return res.status(200).json({ status: 'success', note: 'daily_limit_reached' });
    }

    // 3. Insertar fila en Google Sheets con Timestamp
    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/Sheet1!A:C:append?valueInputOption=USER_ENTERED`;

    const sheetsRes = await fetch(appendUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [[nombre, telefono, `${argentinaTimestamp} (${argentinaDateStr})`]],
      }),
    });

    const sheetsData = await sheetsRes.json();
    if (!sheetsRes.ok) {
      console.error('Error appending row:', sheetsData);
      return res.status(500).json({ error: 'Error al registrar en Google Sheets' });
    }

    return res.status(200).json({ status: 'success' });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}
