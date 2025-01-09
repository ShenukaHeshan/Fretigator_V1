import dateFormat from 'dateformat';
import colors from 'colors';
export let DebugMode = true;
export let TableMode = true;
export let ClearMode = false;
export var memoryArray = [];



var TotalMemoryOfApp = 1024;
var serialdataArray = [];

let feedbackArray = [];
let sensorArray = [];
var stateDetails = {
	stateName: "",
	stateTime: 0
}
let loopDetails = [];

let EC_Ph;
let CurrentRecipe;
var recipeIndex=0;

// class CommonFunctions {  
//     constructor(){
//     }


//     Debug(text) {
//         if(DebugMode)console.log(text);
//     }
//     getDebugMode(){return DebugMode;}
//    
// }

// export default CommonFunctions;


setInterval(function () { logMemory(); }, 5000);
var refreshRate = 500;
if (ClearMode) refreshRate = 500; else refreshRate = 2000;
if (TableMode) {
	setInterval(function () { Draw(); }, refreshRate);
}

export function setDebugMode(mode) { DebugMode = mode };

export function DebugLog(text) {
	DebugMode ? console.log(dateFormat(Date(), "mmmm dS h:MM:ss TT") + " " + text) : "";
}

export function ResponseLog(text) {
	//  DebugLog(text);x
	console.log(dateFormat(Date(), "dddd, mmmm dS, yyyy, h:MM:ss TT") + " " + text);
}
//function start
export function FsLog(text) {
	//   DebugLog(text);
	// console.log(dateFormat(Date(), "dddd, mmmm dS, yyyy, h:MM:ss TT")+" "+text);
}
//function end
export function FeLog(text) {
	// DebugLog(text);
}
export function BusyLog(text) {
	DebugMode ? console.log(dateFormat(Date(), " h:MM:ss TT") + " " + text) : "";
}
export function FeedbackLog(text) {
	//DebugLog(text);
	//console.log(dateFormat(Date(), "dddd, mmmm dS, yyyy, h:MM:ss TT")+" "+text);
}

export function EcPhLog(ECPH) {
	EC_Ph = ECPH;
}
export function LoopDetails(loops) {
	loopDetails = loops;
}
export function CurrentStateLog(stateName, stateTime) {
	stateDetails.stateName = stateName;
	stateDetails.stateTime = stateTime;
}
export function SensorDataLog(sensor) {
	if (sensorArray.findIndex(item => item.id === sensor.deviceID) < 0) {
		let device = {};
		device.id = sensor.deviceID;
		device.typeId = sensor.type_id;
		device.value = sensor.sensorValue;
		device.name = sensor.userSensorText;
		device.typename = sensor.sensorType;
		sensorArray.push(device);
	} else {
		var index = sensorArray.findIndex(item => item.id === sensor.deviceID);
		sensorArray[index].id = sensor.deviceID;
		sensorArray[index].typeId = sensor.type_id;
		sensorArray[index].value = sensor.sensorValue;
		sensorArray[index].name = sensor.userSensorText;
		sensorArray[index].typename = sensor.sensorType;
	}
}
export function RelayFeedbackLog(driver, relayEnableCount, feedBack) {

	if (feedbackArray.findIndex(item => item.driver === driver) < 0) {
		let feedbackDriver = {};
		feedbackDriver.driver = driver;
		feedbackDriver.relayEnableCount = relayEnableCount;
		feedbackDriver.feedBack = [];
		feedbackDriver.feedBack[feedBack.relay] = feedBack;
		feedbackArray.push(feedbackDriver);

	} else {
		var index = feedbackArray.findIndex(item => item.driver === driver);
		let feedbackDriver = feedbackArray[index];
		feedbackDriver.feedBack[feedBack.relay] = feedBack;
		feedbackArray[index] = feedbackDriver;
	}

	//DebugLog(text);
	//console.log(dateFormat(Date(), "dddd, mmmm dS, yyyy, h:MM:ss TT")+" "+text);
}
export function SerialLog(path, msg) {
	if (!TableMode)
		console.log(dateFormat(Date(), "h:MM:ss TT") + " Serial " + path + " : " + msg);

	let serialdata = {};
	serialdata.time = dateFormat(Date(), "h:MM:ss TT");
	serialdata.path = path;
	serialdata.msg = msg;
	if (ClearMode) {
		if (serialdataArray.findIndex(item => item.path === path) < 0) {
			serialdataArray.push(serialdata);
		} else {
			serialdataArray[serialdataArray.findIndex(item => item.path === path)] = serialdata;
		}
	} else {
		serialdataArray.push(serialdata);
	}
	//DebugLog(text);
	//console.log(dateFormat(Date(), "dddd, mmmm dS, yyyy, h:MM:ss TT")+" "+msg);
}

export function Table(data) {
	//DebugLog(text);
	data.time = dateFormat(Date(), "dddd, mmmm dS, yyyy, h:MM:ss TT");
	console.table(data);
}
export function FeedbackTable(name, Value, Internal, External) {

	var table = {};
	table.Value = Value;
	table.Internal = Internal;
	table.External = External;
	console.log("|       " + name + "       |");
	console.table(table);
}
export function removeA(arr) {
	var what, a = arguments, L = a.length, ax;
	while (L > 1 && arr.length) {
		what = a[--L];
		while ((ax = arr.indexOf(what)) !== -1) {
			arr.splice(ax, 1);
		}
	}
	return arr;
}
export function pushA(arr, value) {
	if (!arr.includes(value)) {
		arr.push(value);
	}
	return arr;
}
export function LogCurrentRecipe(index,recipe) {
	CurrentRecipe = recipe;
	if(index!=null){
	CurrentRecipe.index = index;
	}
}

export function ByteToArray(byte) {
	var array = [];
	if (((255 ^ (byte))) & 1) {
		array[0] = 0;
	} else {
		array[0] = 1;
	}
	if (((255 ^ (byte)) >> 1) & 1) {
		array[1] = 0;
	} else {
		array[1] = 1;
	}
	if (((255 ^ (byte)) >> 2) & 1) {
		array[2] = 0;
	} else {
		array[2] = 1;
	}
	if (((255 ^ (byte)) >> 3) & 1) {
		array[3] = 0;
	} else {
		array[3] = 1;
	}
	if (((255 ^ (byte)) >> 4) & 1) {
		array[4] = 0;
	} else {
		array[4] = 1;
	}
	if (((255 ^ (byte)) >> 5) & 1) {
		array[5] = 0;
	} else {
		array[5] = 1;
	}
	if (((255 ^ (byte)) >> 6) & 1) {
		array[6] = 0;
	} else {
		array[6] = 1;
	}
	if (((255 ^ (byte)) >> 7) & 1) {
		array[7] = 0;
	} else {
		array[7] = 1;
	}
	return array;

}

function logMemory() {
	const used = process.memoryUsage();
	memoryArray = [];
	for (let key in used) {
		let memory = {};
		memory.key = `${key}`;
		memory.memory = `${Math.round(used[key] / 1024 / 1024 * 100) / 100} MB`;
		if (memoryArray.findIndex(item => item.key === memory.key) < 0) {
			memoryArray.push(memory);
		} else {
			memoryArray[memoryArray.findIndex(item => item.key === memory.key)] = memory;
		}
		//memoryArray.push(`Memory: ${key} ${Math.round(used[key] / 1024 / 1024 * 100) / 100} MB`);
		if (`${key}` == "rss" && `${Math.round(used[key] / 1024 / 1024 * 100) / 100}` > TotalMemoryOfApp) {
			console.log(colors.bgBlack.red("‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾memory low‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾"));
			process.exit(0);
		}

	}
	try {
		if (global.gc) {
			global.gc();
		}
	} catch (e) {
		console.log("`node --expose-gc ../test.js`");
		//process.exit();
	}
	// console.log(colors.bgBlack.red("‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾"));
}

function Draw() {

	if (!DebugMode) {
		process.stdout.write("\u001b[2J\u001b[0;0H");
		console.log(formatDateToDisplay());
		console.log("CURRENT STATE " + stateDetails.stateName + " " + stateDetails.stateTime);
		if (memoryArray.length > 0)
			console.table(memoryArray);
		if (serialdataArray.length > 0)
			console.table(serialdataArray);
		if (feedbackArray.length > 0) {
			feedbackArray.forEach(element => {
				let setValue = [];
				let internalFeedback = [];
				let ExternalFeedback = [];
				for (let index = 0; index < element.relayEnableCount; index++) {
					const fed = element.feedBack[index];
					if (fed) {
						setValue.push(fed.setvalue);
						internalFeedback.push(fed.internalFeedback);
						ExternalFeedback.push(fed.externalFeedback);
					} else {
						setValue.push("-");
						internalFeedback.push("-");
						ExternalFeedback.push("-");
					}
				}
				let temp = {};
				temp.driver = element.driver;
				temp.setValue = setValue;
				temp.internalFeedback = internalFeedback;
				temp.ExternalFeedback = ExternalFeedback;
				console.table(temp);
			});
		}
		if (loopDetails.length > 0) {
			let loopArray = [];
			loopDetails.forEach((element, index) => {
				let loop = {
					name: element.loop_id,
					level: element.localTankWaterLevel,
					set: element.localTankSetLevel,
					'total %': Math.round(element.localTankWaterLevel * 100 / element.localTankMaxLevel),
					'set %': Math.round(element.localTankWaterLevel * 100 / element.localTankSetLevel),
					drainPump: element.loopDrainPumpRelayValue,
					solonoid: element.loopOutDeviceValue,
					inFlow: element.loopInFlowMeterValue,
					outFlow: element.loopOutFlowMeterValue
				};
				loopArray.push(loop);
			});
			console.log("Loops");
			console.table(loopArray);
		}
		if (EC_Ph) {
			console.log("Current EC PH");
			console.table(EC_Ph);
		}
		if(CurrentRecipe){
			console.log("Current Recipe");
			console.table(CurrentRecipe);
		}
		if (sensorArray.length > 0) {
			var tempsensor = [];
			sensorArray.forEach(element => {
				var device = {};
				device.name = element.name;
				device.id = element.id;
				device.value = element.value;
				tempsensor.push(device);
			});
			console.table(tempsensor);
		}
	}
	if (!ClearMode) {
		serialdataArray = [];
	}
}
export function formatDateToDisplay() {
	var d = new Date(),
		month = '' + (d.getMonth() + 1),
		day = '' + d.getDate(),
		year = d.getFullYear();
	var hours = d.getHours();
	var minutes = d.getMinutes();
	var sec = d.getSeconds();
	var ampm = hours >= 12 ? 'pm' : 'am';
	hours = hours % 12;
	hours = hours ? hours : 12; // the hour '0' should be '12'
	minutes = minutes < 10 ? '0' + minutes : minutes;
	sec = sec < 10 ? '0' + sec : sec;
	var strTime = hours + ':' + minutes + ':' + sec + ' ' + ampm;


	if (month.length < 2)
		month = '0' + month;
	if (day.length < 2)
		day = '0' + day;

	return [year, month, day].join('/') + "," + strTime;
}

export function formatTimeDisplay(d) {
	var hours = d.getHours();
	var minutes = d.getMinutes();
	var sec = d.getSeconds();
	var ampm = hours >= 12 ? 'pm' : 'am';
	hours = hours % 12;
	hours = hours ? hours : 12; // the hour '0' should be '12'
	minutes = minutes < 10 ? '0' + minutes : minutes;
	sec = sec < 10 ? '0' + sec : sec;
	var strTime = hours + ':' + minutes + ':' + sec + ' ' + ampm;

	return strTime;
}
// var s0 = new Array (120)
// for (var i = 0; i < s0.length; i++)
//     s0[i] = 5 * Math.sin (i * ((Math.PI * 4) / s0.length))
// console.log (asciichart.plot (s0));


export function ErrorLog(message, error) {
    console.error(`***** ${dateFormat(new Date(), "dddd, mmmm dS, yyyy, h:MM:ss TT")} *****`);
	if (typeof message !== "undefined") {
		console.error(message);
	}

	if (error) {
		console.error(error);
	}
}


export function Log(i) {
    const timestamp = dateFormat(new Date(), "dddd, mmmm dS, yyyy, h:MM:ss TT");
	console.log(`***** ${timestamp} - ${i} *****`);
}


