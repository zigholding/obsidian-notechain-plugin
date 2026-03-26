import { WebViewerSelectorProfile } from './SelectorDrivenWebViewer';

export const chatGLMProfile: WebViewerSelectorProfile = {
	newChatSelectors: ['div.subject.active'],
	inputSelectors: ['textarea'],
	sendButtonSelectors: ['.enter_icon.el-tooltip__trigger.el-tooltip__trigger:not(.empty)'],
	receiveMessageSelectors: ['.answer-content-wrap:not(.text-thinking-content)'],
	receiveDoneSelectors: ['div.copy'],
	lastContentSelectors: ['.answer-content-wrap:not(.text-thinking-content)']
};

export const claudeProfile: WebViewerSelectorProfile = {
	newChatSelectors: ['a[aria-label="New chat"]'],
	inputSelectors: ['.ProseMirror'],
	sendButtonSelectors: ['button[aria-label="Send message"]'],
	receiveMessageSelectors: ['.font-claude-response.relative'],
	receiveDoneSelectors: ['div.w-fit[data-state="closed"]'],
	lastContentSelectors: ['.font-claude-response.relative']
};

export const deepSeekProfile: WebViewerSelectorProfile = {
	inputSelectors: ['textarea[id="chat-input"]'],
	sendButtonSelectors: ['div[role="button"]:not(.ds-button)'],
	receiveMessageSelectors: ['.ds-markdown'],
	lastContentSelectors: ['.ds-markdown']
};

export const doubaoProfile: WebViewerSelectorProfile = {
	inputSelectors: ['textarea[data-testid="chat_input_input"]'],
	sendButtonSelectors: ['#flow-end-msg-send'],
	receiveMessageSelectors: ['div[data-testid="receive_message"]'],
	receiveDoneSelectors: ['button[data-testid="message_action_like"]'],
	lastContentSelectors: ['div[data-testid="receive_message"] div[data-testid="message_text_content"]'],
	copyButtonSelectors: ['.segment-actions-content-btn']
};

export const geminiProfile: WebViewerSelectorProfile = {
	newChatSelectors: ['side-nav-action-button[data-test-id="new-chat-button"] button'],
	inputSelectors: ['rich-textarea div.ql-editor[contenteditable="true"]'],
	sendButtonSelectors: ['button.send-button.submit'],
	receiveMessageSelectors: ['model-response'],
	receiveDoneSelectors: ['thumb-down-button'],
	lastContentSelectors: ['model-response']
};

export const kimiProfile: WebViewerSelectorProfile = {
	newChatSelectors: ['.new-chat-btn'],
	inputSelectors: ['.chat-input-editor-container .chat-input-editor'],
	sendButtonSelectors: ['.send-button'],
	receiveMessageSelectors: ['.chat-content-item .segment-content-box'],
	receiveDoneSelectors: ['svg[name="Like"]'],
	lastContentSelectors: ['.chat-content-item .segment-content-box'],
	copyButtonSelectors: ['.segment-actions-content-btn']
};

export const yuanbaoProfile: WebViewerSelectorProfile = {
	newChatSelectors: ['.yb-common-nav__new-chat'],
	inputSelectors: ['.chat-input-editor .ql-editor'],
	sendButtonSelectors: ['a[class^="style__send-btn"]'],
	receiveMessageSelectors: ['.hyc-content-md .hyc-common-markdown'],
	receiveDoneSelectors: ['.agent-chat__toolbar__copy__icon'],
	lastContentSelectors: ['.hyc-content-md .hyc-common-markdown'],
	lastContentFilterSelector: '.hyc-component-reasoner__think-content'
};

export const chatGPTProfile: WebViewerSelectorProfile = {
	newChatSelectors: ['a[data-testid="create-new-chat-button"]'],
	inputSelectors: ['div#prompt-textarea.ProseMirror'],
	sendButtonSelectors: ['button#composer-submit-button'],
	receiveMessageSelectors: ['div[data-message-author-role="assistant"]'],
	receiveDoneSelectors: [
		'button[data-testid="good-response-turn-action-button"]',
		'button[data-testid="copy-turn-action-button"]'
	],
	lastContentSelectors: ['div[data-message-author-role="assistant"] div.markdown']
};
