   module.exports = {
       onload: function(api) {
           console.log("[Hello Connector] I am alive!")
           
           // 1. Add a button to the toolbar
           api.ui.addToolbarButton('🚀', 'Launch Connector', () => {
               const text = api.workspace.getActiveText()
               const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0
               api.ui.showToast(`Connector says: You have ${wordCount} words!`)
           })

           // 2. Register a dummy MCP tool (check your DevTools console!)
           api.mcp.registerTool('get_word_count', 'Returns the word count of the active note', () => {
               const text = api.workspace.getActiveText()
               return text.trim() ? text.trim().split(/\s+/).length : 0
           })
       },
       
       onunload: function() {
           console.log("[Hello Connector] Goodbye!")
       }
   }