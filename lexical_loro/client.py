# Copyright (c) 2023-2025 Datalayer, Inc.
# Distributed under the terms of the MIT License.

class Client:
    """Simple client representation"""
    def __init__(self, websocket, client_id: str):
        self.websocket = websocket
        self.id = client_id
        self.color = self._generate_color()
        
    def _generate_color(self):
        """Generate a unique color for this client"""
        colors = ["#ff6b6b", "#4ecdc4", "#45b7d1", "#96ceb4", "#feca57", 
                 "#ff9ff3", "#54a0ff", "#5f27cd", "#00d2d3", "#ff9f43"]
        return colors[hash(self.id) % len(colors)]
