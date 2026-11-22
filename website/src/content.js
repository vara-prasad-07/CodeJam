export const links={marketplace:'https://marketplace.visualstudio.com/items?itemName=CodeJam.codejam-workspace',github:'https://github.com/vara-prasad-07/CodeJam',docs:'https://github.com/vara-prasad-07/CodeJam#setup-on-windows-macos-and-linux',nexconn:'https://www.nexconn.ai/product/chat'};
export const media={demo:{src:'/videos/demo.mp4',poster:'/assets/demo-poster.jpg',title:'Meet CodeJam',duration:'3:05'},install:{src:'/videos/how-to-install.mp4',poster:'/assets/install-poster.jpg',title:'Install CodeJam Workspace'}};
export const productViews=[
 {id:'chat',label:'Team chat',icon:'chat',title:'The conversation belongs here.',description:'A project room, your teammates, and the code you’re working on. No hunting through another app to find the context.',image:'/assets/chat_snap.png',alt:'CodeJam team chat open in the VS Code sidebar'},
 {id:'code',label:'Shared code',icon:'code',title:'Share the code. Bring the context.',description:'Send the selected lines with the file, branch, and revision attached. Teammates open it in their own checkout, or read the saved snapshot.',image:'/assets/shared-code.png',alt:'Sharing selected code with the team through the VS Code context menu'},
 {id:'decisions',label:'Decisions',icon:'decision',title:'A decision worth remembering.',description:'Keep the agreement and its original conversation connected. Find it later without piecing together a long chat history.',image:'/assets/decisions.png',alt:'Saved team decisions inside CodeJam'},
 {id:'agent',label:'Private Agent',icon:'spark',title:'A little help. A deliberate boundary.',description:'Ask Agent about your code. Choose the context, review the private answer, and decide what to share with the room.',image:'/assets/agent.png',alt:'A private Agent response with explicitly selected code context'}
];
export const roles=[
 {title:'The pair programmer',description:'Ask about a function without losing the conversation in another app.',tag:'Chat beside the editor',color:'blue',initials:'PP'},
 {title:'The code reviewer',description:'Open the reference, see the exact excerpt, and understand the question.',tag:'Code with its context',color:'peach',initials:'CR'},
 {title:'The remote teammate',description:'Different local checkout? The saved snapshot keeps everyone on the same page.',tag:'Built for different checkouts',color:'green',initials:'RT'},
 {title:'The future teammate',description:'Find the decision and the discussion that led to it, even a week later.',tag:'Reasoning that stays',color:'purple',initials:'FT'},
 {title:'The async collaborator',description:'Leave a voice note when typing it all out would get in the way.',tag:'Record. Preview. Send.',color:'peach',initials:'AC'},
 {title:'The careful builder',description:'Get a private second opinion, then choose what the rest of the team sees.',tag:'You control the context',color:'blue',initials:'CB'}
];
export const faqs=[
 ['What do I need to get started?','Desktop VS Code 1.146.0 or later, a trusted project folder, and an internet connection. Install CodeJam Workspace, sign in, and create or join a room. The default hosted backend does not require your own provider keys.'],
 ['Do teammates need the same local folder?','No. Each teammate links their own checkout or fork. References carry a relative path, revision, and saved excerpt. CodeJam can relocate moved lines by content or open the original shared snapshot when local files differ.'],
 ['What happens to my Agent questions?','You choose whether to include selected code, recent messages, or a Git diff. Gemini generates a private answer. It becomes a room message only when you choose Share with room.'],
 ['How do voice messages and calls work?','Voice messages are recorded locally, previewed, then uploaded through NexConn Chat. Live audio huddles use the NexConn Call SDK in a browser page. Native recording requires a matching desktop recorder; see the repository for platform requirements.']
];
