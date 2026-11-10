// The modules the test team knows how to try. The scheduled run takes one a
// night, in this order, so every module gets its turn; add a new module here
// and it joins the rotation.

import music from './music.mjs';
import docker from './docker.mjs';
import teamChat from './teamChat.mjs';
import framedPages from './framedPages.mjs';
import windowGroups from './windowGroups.mjs';
import leadHound from './leadHound.mjs';
import figma from './figma.mjs';
import agentRegistry from './agentRegistry.mjs';
import chatCapabilities from './chatCapabilities.mjs';
import liveBoard from './liveBoard.mjs';
import sketchpad from './sketchpad.mjs';
import sheets from './sheets.mjs';
import marketplace from './marketplace.mjs';
import scheduler from './scheduler.mjs';
import sharedLink from './sharedLink.mjs';
import terminal from './terminal.mjs';
import doc from './doc.mjs';
import messageRouter from './messageRouter.mjs';
import chatTwoPeople from './chatTwoPeople.mjs';
import aiResources from './aiResources.mjs';
import localSites from './localSites.mjs';
import gitDiff from './gitDiff.mjs';
import inbox from './inbox.mjs';
import research from './research.mjs';
import stepCards from './stepCards.mjs';
import slides from './slides.mjs';
import writer from './writer.mjs';
import cadRecipe from './cadRecipe.mjs';
import listingWriter from './listingWriter.mjs';
import layoutStory from './layoutStory.mjs';
import windowTitle from './windowTitle.mjs';
import photoText from './photoText.mjs';
import gitDiffTyping from './gitDiffTyping.mjs';
import arenaTyping from './arenaTyping.mjs';
import legionTyping from './legionTyping.mjs';
import imagePromptTyping from './imagePromptTyping.mjs';
import leadBriefTyping from './leadBriefTyping.mjs';
import ideaTagTyping from './ideaTagTyping.mjs';
import pdfTextTyping from './pdfTextTyping.mjs';
import modelNoteTyping from './modelNoteTyping.mjs';
import workflowStepTyping from './workflowStepTyping.mjs';
import localSiteTyping from './localSiteTyping.mjs';
import writerTableTyping from './writerTableTyping.mjs';
import whatsappTyping from './whatsappTyping.mjs';
import ideaBulletTyping from './ideaBulletTyping.mjs';
import todoTextTyping from './todoTextTyping.mjs';
import docCursors from './docCursors.mjs';
import leadDraftTyping from './leadDraftTyping.mjs';
import stepReportTyping from './stepReportTyping.mjs';
import vectorText from './vectorText.mjs';
import imageStudioTyping from './imageStudioTyping.mjs';
import agentCompany from './agentCompany.mjs';
import modelArena from './modelArena.mjs';
import boardMap from './boardMap.mjs';
import emptyBoard from './emptyBoard.mjs';
import unsavedChanges from './unsavedChanges.mjs';
import joinNotices from './joinNotices.mjs';
import vaultNotes from './vaultNotes.mjs';
import calendar from './calendar.mjs';
import fileGone from './fileGone.mjs';
import secretFiles from './secretFiles.mjs';
import versions from './versions.mjs';
import grokSignIn from './grokSignIn.mjs';
import finderFiles from './finderFiles.mjs';
import addNames from './addNames.mjs';
import filesCatchUp from './filesCatchUp.mjs';
import notSaved from './notSaved.mjs';
import githubReads from './githubReads.mjs';
import logsNameNoFiles from './logsNameNoFiles.mjs';
import agentHiddenWords from './agentHiddenWords.mjs';
import toolsGiven from './toolsGiven.mjs';
import githubReview from './githubReview.mjs';
import githubFixRequest from './githubFixRequest.mjs';
import appFolderFiles from './appFolderFiles.mjs';
import windowImporter from './windowImporter.mjs';
import projectList from './projectList.mjs';
import teleprompter from './teleprompter.mjs';
import prompterCursors from './prompterCursors.mjs';
import cadCursors from './cadCursors.mjs';
import arenaCursors from './arenaCursors.mjs';
import legionCursors from './legionCursors.mjs';
import legionWhoTyped from './legionWhoTyped.mjs';
import diffCursors from './diffCursors.mjs';
import studioCursors from './studioCursors.mjs';
import genImageCursors from './genImageCursors.mjs';
import whatsappCursors from './whatsappCursors.mjs';
import titleCursors from './titleCursors.mjs';
import ideaTagCursors from './ideaTagCursors.mjs';
import vaultNoteCursors from './vaultNoteCursors.mjs';
import leadBriefCursors from './leadBriefCursors.mjs';
import leadDraftCursors from './leadDraftCursors.mjs';
import outboxCursors from './outboxCursors.mjs';
import todoCursors from './todoCursors.mjs';
import ideaBulletCursors from './ideaBulletCursors.mjs';
import workflowStepCursors from './workflowStepCursors.mjs';
import stepReportCursors from './stepReportCursors.mjs';
import writerCellCursors from './writerCellCursors.mjs';
import slideBoxCursors from './slideBoxCursors.mjs';
import racetrack from './racetrack.mjs';
import asteroids from './asteroids.mjs';
import inviteLinks from './inviteLinks.mjs';
import listingCursors from './listingCursors.mjs';
import siteCursors from './siteCursors.mjs';
import notesCursors from './notesCursors.mjs';
import modelNoteCursors from './modelNoteCursors.mjs';
import vectorCursors from './vectorCursors.mjs';
import pdfCursors from './pdfCursors.mjs';
import layoutCursors from './layoutCursors.mjs';
import photoVideoCursors from './photoVideoCursors.mjs';
import codeCursors from './codeCursors.mjs';
import writerCursors from './writerCursors.mjs';
import sheetCellCursors from './sheetCellCursors.mjs';
import whoTyped from './whoTyped.mjs';
import prompterWhoTyped from './prompterWhoTyped.mjs';
import codeWhoTyped from './codeWhoTyped.mjs';
import vaultWhoTyped from './vaultWhoTyped.mjs';
import slideNotesWhoTyped from './slideNotesWhoTyped.mjs';
import codeRobot from './codeRobot.mjs';
import arenaWhoTyped from './arenaWhoTyped.mjs';
import slideBoxWhoTyped from './slideBoxWhoTyped.mjs';
import rhythmRun from './rhythmRun.mjs';

export const MODULES = [music, docker, teamChat, framedPages, windowGroups, leadHound, figma, agentRegistry, chatCapabilities, liveBoard, sketchpad, sheets, marketplace, scheduler, sharedLink, terminal, doc, messageRouter, chatTwoPeople, aiResources, localSites, gitDiff, inbox, research, stepCards, slides, agentCompany, modelArena, boardMap, emptyBoard, unsavedChanges, joinNotices, vaultNotes, calendar, fileGone, secretFiles, versions, grokSignIn, finderFiles, addNames, filesCatchUp, notSaved, githubReads, logsNameNoFiles, agentHiddenWords, toolsGiven, githubReview, githubFixRequest, appFolderFiles, windowImporter, projectList, teleprompter, writer, cadRecipe, listingWriter, layoutStory, windowTitle, photoText, gitDiffTyping, arenaTyping, legionTyping, imagePromptTyping, leadBriefTyping, ideaTagTyping, vectorText, imageStudioTyping, pdfTextTyping, modelNoteTyping, workflowStepTyping, localSiteTyping, writerTableTyping, whatsappTyping, stepReportTyping, ideaBulletTyping, leadDraftTyping, todoTextTyping, docCursors, prompterCursors, arenaCursors, legionCursors, diffCursors, studioCursors, genImageCursors, whatsappCursors, titleCursors, ideaTagCursors, vaultNoteCursors, leadBriefCursors, listingCursors, siteCursors, notesCursors, modelNoteCursors, writerCursors, leadDraftCursors, todoCursors, ideaBulletCursors, workflowStepCursors, stepReportCursors, writerCellCursors, slideBoxCursors, cadCursors, vectorCursors, pdfCursors, layoutCursors, photoVideoCursors, racetrack, inviteLinks, codeCursors, outboxCursors, sheetCellCursors, whoTyped, prompterWhoTyped, asteroids, codeWhoTyped, vaultWhoTyped, slideNotesWhoTyped, codeRobot, arenaWhoTyped, legionWhoTyped, slideBoxWhoTyped, rhythmRun];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Which modules this run tries: "next" (one, by the date), "all", or names
 * separated by commas or spaces. Unknown names throw, listing the known ones.
 */
export function pickModules(asked = 'next', date = new Date(), modules = MODULES) {
  const wanted = String(asked || 'next').split(/[\s,]+/).filter(Boolean);
  if (wanted.length === 1 && wanted[0] === 'all') return [...modules];
  if (wanted.length === 1 && wanted[0] === 'next') {
    const day = Math.floor(date.getTime() / DAY_MS);
    return [modules[day % modules.length]];
  }
  return wanted.map((id) => {
    const found = modules.find((m) => m.id === id);
    if (!found) throw new Error(`no module called "${id}"; known: ${modules.map((m) => m.id).join(', ')}`);
    return found;
  });
}
