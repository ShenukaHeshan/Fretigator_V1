import { memoryArray } from "./commonFunctions.js";
import fs from "fs";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";

class LogHandler {
  constructor(apiService, clearOnStart = false) {
    this.api = apiService;
    this.errorLogPath = "logs/system-error.log"; // Error log file

    // Ensure logs directory exists
    if (!fs.existsSync("logs")) {
      fs.mkdirSync("logs");
    }

    // Initialize Winston logger with daily rotation for general logs
    this.logger = winston.createLogger({
      level: "info", // Default level
      transports: [
        new DailyRotateFile({
          filename: "logs/system-%DATE%.log", // Rotated logs format
          datePattern: "YYYY-MM-DD", // New file every day
          maxFiles: "10d", // Keep logs for last 10 days
          maxSize: "20m", // Limit file size to 20MB per day
          zippedArchive: false, // Set to true to compress old logs
        }),
        new winston.transports.Console(), // Also log to console for debugging
      ],
      format: winston.format.combine(
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), // Custom timestamp
        winston.format.printf(({ timestamp, level, message }) => {
          return `${timestamp} [${level.toUpperCase()}]: ${message}`;
        })
      ),
    });

    // Separate logger for system-error.log (Only logs errors)
    this.errorLogger = winston.createLogger({
      level: "error",
      transports: [
        new winston.transports.File({ filename: this.errorLogPath }), // Logs errors into system-error.log
      ],
      format: winston.format.combine(
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.json()
      ),
    });

    // Clear logs if required
    if (clearOnStart) {
      this.clearErrorLog();
    }
  }

  // Function to log System errors
  systemError(currentNodeId, currentState, stateTimer, errorCode, errorMessage, errorDescription, isSkipable, data) {
    const formData = {
      timestamp: new Date().toISOString(),
      level: "error",
      currentNodeId,
      currentState,
      stateTimer,
      errorCode,
      errorMessage,
      errorDescription,
      isSkipable,
      memoryUsage: { memoryArray },
      data,
    };

    // Log the error in both log files
    this.logger.error(JSON.stringify(formData)); // Logs in system-%DATE%.log
    this.errorLogger.error(JSON.stringify(formData)); // Logs in system-error.log

    // API call to report the error (uncomment if needed)
    this.api.logError(formData, (isSuccess) => { });
  }

  // Function to log informational messages
  logInfo(message, data = {}) {
    const logData = {
      timestamp: new Date().toISOString(),
      level: "info",
      message,
      data,
    };

    // Log the message with data
    this.logger.info(JSON.stringify(logData));
  }

  logError(message, data = {}) {
    const logData = {
      timestamp: new Date().toISOString(),
      level: "error",
      message,
      data,
    };

    // Log the message with data
    this.logger.error(JSON.stringify(logData, null, 2));
  }

  // Function to clear system-error.log file
  clearErrorLog() {
    if (fs.existsSync(this.errorLogPath)) {
      fs.writeFileSync(this.errorLogPath, "", "utf8");
      console.log("system-error.log has been cleared.");
    }
  }

  // Function to check if system-error.log has any errors
  hasErrorsInLog() {
    if (!fs.existsSync(this.errorLogPath)) {
      return false;
    }

    const fileContents = fs.readFileSync(this.errorLogPath, "utf8").trim();
    return fileContents.length > 0;
  }
}

export default LogHandler;