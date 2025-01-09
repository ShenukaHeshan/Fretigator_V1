import schedule from "node-schedule";
import * as CF from "./commonFunctions.js";
import colors from "colors";

class RelaySchedule {
    constructor(deviceArray, callback) {
        this.job = {
            deviceArray,
            callback,
            relayScheduleArray: [],
        };
        this.initialize();
    }

    initialize() {
        this.job.deviceArray.forEach((device) => this.reschedule(device));
    }

    reschedule(device) {
        // Cancel existing schedules for the device
        this.job.relayScheduleArray = this.job.relayScheduleArray.filter((schedules) => {
            schedules.forEach((scheduleJob) => {
                if (scheduleJob && scheduleJob.name.includes(device.deviceID)) {
                    CF.DebugLog(`Cancelling existing schedule for relay ${device.deviceID}`);
                    scheduleJob.cancel();
                }
            });
            return !schedules.some((schedule) => schedule && schedule.name.includes(device.deviceID));
        });

        // Schedule new jobs for the device
        if (device.schedule && device.duration) {
            const relaySchedules = device.schedule.map((scheduleTime, index) => {
                if (scheduleTime && device.duration[index]) {
                    CF.DebugLog(`Scheduling relay ${device.deviceID} at ${scheduleTime} for ${device.duration[index]} ms`);
                    return schedule.scheduleJob(`${device.deviceID}_${index}`, scheduleTime, () => {
                        console.log(colors.black.bgGreen(`Relay ${device.deviceID} schedule triggered at index ${index}`));
                        this.job.callback(device.deviceID, index, scheduleTime, device.duration[index]);
                    });
                } else {
                    const emptyJob = schedule.scheduleJob(`${device.deviceID}_${index}`, "* * 7 * * *", () => {});
                    emptyJob.cancel();
                    return emptyJob;
                }
            });
            this.job.relayScheduleArray.push(relaySchedules);
        }
    }
}

export default RelaySchedule;