function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // Si la hoja está totalmente vacía, le agrega encabezados en la primera fila
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["Fecha y Hora", "Nombre y Apellido", "Teléfono"]);
    }

    var data = JSON.parse(e.postData.contents);
    var fecha = data.fecha || new Date().toLocaleString("es-AR");
    var nombre = data.nombre || "";
    var telefono = data.telefono || "";

    // Agrega la nueva fila con los datos
    sheet.appendRow([fecha, nombre, telefono]);

    return ContentService
      .createTextOutput(JSON.stringify({ status: "success" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
