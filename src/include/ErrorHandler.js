import { memoryArray } from "./commonFunctions.js";
import fs from "fs";
import winston from "winston";

class ErrorHandler {
  constructor(apiService, clearOnStart = false) {
    this.api = apiService;
    this.errorLogPath = "error.log";

    // Initialize Winston logger
    this.logger = winston.createLogger({
      level: "error",
      transports: [new winston.transports.File({ filename: this.errorLogPath })],
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    });

    // Clear the log file on start if required
    if (clearOnStart) {
      this.clearLog();
    }
  }

  // Function to log errors
  logError(currentNodeId, currentState, stateTimer, errorCode, errorMessage, errorDescription, isSkipable, data) {
    const formData = {
      currentNodeId,
      currentState,
      stateTimer,
      errorCode,
      errorMessage,
      errorDescription,
      isSkipable,
      memoryUsage: { memoryArray },
      data,
      timestamp: new Date().toISOString(),
    };

    this.logger.error(formData);

    // API call to report the error
    this.api.logError(formData, (isSuccess) => {});
  }

  // Function to clear the log file
  clearLog() {
    fs.writeFileSync(this.errorLogPath, "", "utf8");
  }

  // Function to check if the log file contains any errors
  hasErrorsInLog() {
    if (!fs.existsSync(this.errorLogPath)) {
      return false;
    }

    const fileContents = fs.readFileSync(this.errorLogPath, "utf8");
    return fileContents.trim().length > 0;
  }

  // Function to read the log file content (for easier human readability if needed)
  readLog() {
    if (!fs.existsSync(this.errorLogPath)) {
      return null;
    }

    return fs.readFileSync(this.errorLogPath, "utf8");
  }
}

export default ErrorHandler;


