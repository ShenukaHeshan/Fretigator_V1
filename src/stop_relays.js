import gpio from 'rpi-gpio';
import fs from 'fs';
import delay from 'delay';

eval(fs.readFileSync('./include/constants.js') + '');
import relayDrive from "./include/RelayController.js";


global.I2C_Busy = 0;

let relayDriver1 = new relayDrive(0x21, 0x27, "1", 8, function (err) {
	err.forEach(element => {
		console.log("driver " + element.driver + "  " + element.error);
	});

});
let relayDriver2 = new relayDrive(0x22, 0x20, "2", 4, function (err) {
	err.forEach(element => {
		console.log("driver " + element.driver + "  " + element.error);
	});
});
console.log("Stop Relay.js ");
gpio.setMode(gpio.MODE_BCM);
//Main relay
gpio.setup(20, gpio.DIR_OUT, () => {
	gpio.write(20, 0, (err) => {
		if (err) throw err;
		console.log(`AIGROW CLEANUP -  STOPPING ALL RELAYS - Pin 20 initialize to 0`);
		//process.exit();
	});
});


function safety_stop_all() {
	console.log("STOP ALL RELAYS");
	relayDriver1.stopAll();
	relayDriver2.stopAll();
}



//Alarm
gpio.setup(11, gpio.DIR_OUT, () => {
	gpio.write(11, 1, (err) => {
		if (err) throw err;
		console.log(`AIGROW CLEANUP -  Alarm start - Pin 11 initialize to 1`);

	});
});
delay(1000)
	.then(() => {
		safety_stop_all();

	});

delay(3000)
	.then(() => {
		process.exit();
	});


