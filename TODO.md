# Call Handling Fix - TODO

## Completed Tasks
- [x] Modified `callController.js` to add `rejectCall` method for proper call rejection handling
- [x] Fixed `call:accept` handler in `chatSocket.js` to properly accept existing calls and notify both parties
- [x] Fixed `call:reject` handler in `chatSocket.js` to properly reject calls and update database
- [x] Implemented proper call flow: initiate (ongoing) -> accept (active) -> end (completed) or reject (rejected)

## Summary of Changes
- **callController.js**: Added `rejectCall` method to handle call rejections properly
- **chatSocket.js**: Fixed call acceptance to work with existing calls, added proper notifications to both caller and receiver
- **chatSocket.js**: Fixed call rejection to update database and notify caller
- **Result**: Calls now follow proper lifecycle: ongoing -> active/completed/rejected

## Expected Behavior Implemented
- [x] User clicks video call button -> popup shown once to receiver, call saved as 'ongoing' in DB
- [x] When accepted -> both users get functional interface with local/remote video, timer, screen share, audio controls
- [x] When rejected -> call saved as 'rejected' in DB, caller notified
- [x] When ended -> call saved as 'completed' in DB with duration

## Files Modified
- `src/controllers/callController.js`
- `src/socket/chatSocket.js`
