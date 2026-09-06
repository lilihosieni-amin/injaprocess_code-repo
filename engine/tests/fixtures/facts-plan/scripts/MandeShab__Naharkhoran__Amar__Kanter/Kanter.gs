**********************************************************************************
Code.js:function addDropdownColumns() {
  var sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  
  // Define the data for each dropdown
  var days = [];
  for (var i = 1; i <= 31; i++) {
    days.push(i.toString());
  }

  var months = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];

  var years = [];
  for (var j = 1404; j <= 1420; j++) {
    years.push(j.toString());
  }
  
  // Loop through all sheets in the spreadsheet
  sheets.forEach(function(sheet) {
    // Insert three new columns at the start
    sheet.insertColumns(1, 3);

    // Set headers for the new columns
    sheet.getRange(1, 1).setValue('روز');
    sheet.getRange(1, 2).setValue('ماه');
    sheet.getRange(1, 3).setValue('سال');
    
    // Define the ranges for the dropdowns, starting from the second row
    var range = sheet.getRange(2, 1, sheet.getMaxRows() - 1, 1); // Column 1: روز (from row 2)
    var rule1 = SpreadsheetApp.newDataValidation().requireValueInList(days).build();
    range.setDataValidation(rule1);
    
    range = sheet.getRange(2, 2, sheet.getMaxRows() - 1, 1); // Column 2: ماه (from row 2)
    var rule2 = SpreadsheetApp.newDataValidation().requireValueInList(months).build();
    range.setDataValidation(rule2);
    
    range = sheet.getRange(2, 3, sheet.getMaxRows() - 1, 1); // Column 3: سال (from row 2)
    var rule3 = SpreadsheetApp.newDataValidation().requireValueInList(years).build();
    range.setDataValidation(rule3);
  });
}
**********************************************************************************
