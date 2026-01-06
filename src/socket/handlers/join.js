const Competition = require('../../models/Competition');
const Participant = require('../../models/Participant');
const logger = require('../../config/logger');

async function handleJoin(socket, io, data, activeCompetitions) {
  const { code, participantName } = data;
  try {
    const competition = await Competition.findOne({ code });

    if (!competition) {
      logger.warn(`Competition code not found: ${code}`);
      socket.emit('error', { message: 'Competition code not found' });
      return;
    }

    if (!activeCompetitions.has(competition._id.toString())) {
      activeCompetitions.set(competition._id.toString(), {
        competitionId: competition._id.toString(),
        code,
        currentRound: -1,
        roundInProgress: false,
        participants: new Map(),
        competitionDoc: competition,
      });
      logger.debug('New active competition created', {
        code,
        competitionId: competition._id,
      });
    }

    const compData = activeCompetitions.get(competition._id.toString());

    // Check if already joined
    const existingParticipant = Array.from(compData.participants.values()).find(
      (p) => p.name === participantName
    );

    if (existingParticipant) {
      logger.warn(`Duplicate name attempt: ${participantName} in ${code}`);
      socket.emit('error', { message: 'Name already taken' });
      return;
    }

    const participant = {
      socketId: socket.id,
      name: participantName,
      joinedAt: Date.now(),
      scores: [],
      currentRoundData: {},
      roundScores: [],
    };

    compData.participants.set(socket.id, participant);

    // Add to MongoDB
    // Create Participant in DB
    await Participant.create({
      competitionId: competition._id,
      name: participantName,
      socketId: socket.id,
      joinedAt: new Date(),
      roundScores: [],
    });

    socket.join(`competition_${competition._id}`);
    socket.competitionId = competition._id.toString();
    socket.participantName = participantName;
    socket.isOrganizer = false;

    // Notify all
    io.to(`competition_${competition._id}`).emit('participantJoined', {
      name: participantName,
      totalParticipants: compData.participants.size,
    });

    socket.emit('joinSuccess', {
      competitionId: competition._id,
      name: competition.name,
      roundCount: competition.rounds.length,
    });

    logger.info(`✓ Participant joined: ${participantName}`, {
      code,
      socketId: socket.id,
      totalParticipants: compData.participants.size,
    });
  } catch (error) {
    logger.error(`Join error: ${error.message}`, {
      code,
      participantName,
      stack: error.stack,
    });
    socket.emit('error', { message: 'Failed to join' });
  }
}

async function handleOrganizerJoin(socket, io, data) {
  try {
    socket.join(`competition_${data.competitionId}`);
    socket.isOrganizer = true;
    logger.info(`✓ Organizer connected`, {
      socketId: socket.id,
      competitionId: data.competitionId,
    });
  } catch (error) {
    logger.error(`Organizer join error: ${error.message}`, {
      competitionId: data.competitionId,
      stack: error.stack,
    });
  }
}

module.exports = { handleJoin, handleOrganizerJoin };
