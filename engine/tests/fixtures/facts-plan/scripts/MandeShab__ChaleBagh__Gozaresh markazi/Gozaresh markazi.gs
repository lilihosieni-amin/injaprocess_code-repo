**********************************************************************************
Code.js:
function JALALI_TO_GREG(jalaliStr) {
  if(!jalaliStr) return '';
  var parts = jalaliStr.split('/');
  var jy = parseInt(parts[0], 10);
  var jm = parseInt(parts[1], 10);
  var jd = parseInt(parts[2], 10);
  var date = jalaliToGregorian(jy, jm, jd);
  return Utilities.formatDate(date, Session.getScriptTimeZone(), "MM/dd/yyyy");
}

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Actions')
    .addItem('Recalculate All', 'triggerRecalculation')
    .addToUi();
}

function triggerRecalculation() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  const triggerCell = sheet.getSheetByName('Refresher').getRange("A1");
  const date = new Date();
  triggerCell.setValue(date.getTime());
  SpreadsheetApp.flush();
}
**********************************************************************************
date.gs:

function jalaliToGregorian(jy, jm, jd) {
  var gy;
  var g_d_m, days;
  var sal_a = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  jy += 1595;
  var days = -355668 + (365 * jy) + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + jd;

  for (var i = 1; i < jm; ++i)
    days += (i <= 6 ? 31 : 30);

  gy = 400 * Math.floor(days / 146097);
  days %= 146097;

  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;

    if (days >= 365)
      days++;
  }

  gy += 4 * Math.floor(days / 1461);
  days %= 1461;

  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }

  var gd, gm;
  var leap = ((gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0));
  sal_a[2] = leap ? 29 : 28;

  for (gm = 1; gm <= 12 && days >= sal_a[gm]; gm++) {
    days -= sal_a[gm];
  }

  gd = days + 1;

  return new Date(gy, gm - 1, gd); // JS Date (month is 0-based)
}

**********************************************************************************
cumtomFunction.gs:
function getValueById(id, data, indicator= '#') {

  const headers = data[0];
  const foodIdString = indicator + id; 
  
  let colIndex = -1;
  for (let i = 0; i < headers.length; i++) {
    if (headers[i].toString().includes(foodIdString)) {
      colIndex = i;
      break;
    }
  }

  if (colIndex === -1) {
    return "ID not found";
  }

  const rowData = data[1];
  return rowData[colIndex] === "#N/A" ? 0 : rowData[colIndex];
}

function getFoodValueById(foodId, data,refresher="") {
  return getValueById(foodId,data,'#')
}

function getIngredientValueById(ingredientId, data,refresher="") {
  return getValueById(ingredientId,data,'##')
}

function getIngredientValue(foodId, ingredientId, namedRange, refresher="") {
  const range = SpreadsheetApp.getActiveSpreadsheet().getRangeByName(namedRange);
  if (!range) {
    return "Error: Named range '" + namedRange + "' not found!";
  }
  const data = range.getValues();
  
  const foodIdString = '#' + foodId; 
  const ingredientIdString = '##' + ingredientId; 

  
  let foodRow = -1;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString().includes(foodIdString)) {
      foodRow = i;
      break;
    }
  }
  
  if (foodRow === -1) {
    return "Food ID " + foodId + " not found!";
  }
  
  let ingredientColumn = -1;
  for (var j = 1; j < data[0].length; j++) {
    if (data[0][j].toString().includes(ingredientIdString)) {
      ingredientColumn = j;
      break;
    }
  }
  
  if (ingredientColumn === -1) {
    return "Ingredient ID " + ingredientId + " not found!";
  }
  
  return data[foodRow][ingredientColumn];
}

function getTotalFoodsIngredient(foodIds, ingredientId, salesData, ingredientNamedRange,refresher="") {
  if(typeof foodIds === "number"){
    const foodValue = getFoodValueById(foodIds,salesData);
    const ingredientValue = getIngredientValue(foodIds, ingredientId, ingredientNamedRange);
    return foodValue * ingredientValue;
  }
  const arr = foodIds[0].map(foodId => {
    const foodValue = getFoodValueById(foodId,salesData);
    const ingredientValue = getIngredientValue(foodId, ingredientId, ingredientNamedRange);
    return foodValue * ingredientValue;
  });
 return arr.filter(x=>Boolean(x)).reduce((acc, currentValue) => acc + currentValue,0);
}

function getTotalFoodsCountsInRowById(foodIds, salesData,refresher="") {
  if(typeof foodIds === "number"){
    return getFoodValueById(foodIds,salesData);
  }
  const arr = foodIds[0].map(foodId => {
    return getFoodValueById(foodId,salesData);
  });
 return arr.filter(x=>Boolean(x)).reduce((acc, currentValue) => acc + currentValue,0);
}



**********************************************************************************


