import { useState } from 'react';
import { motion } from 'motion/react';
import { Store, Code, Gift, Users } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-[#0f1419] p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-6xl mx-auto"
      >
        <div className="mb-8">
          <h1 className="text-4xl md:text-5xl font-extrabold text-[#d9deeb] mb-2">
            VENUE <span className="text-[#c92946]">ADMIN</span>
          </h1>
          <p className="text-[#d9deeb]/60">Manage your venue's Jaffa experience</p>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-[#1a1f2b] border border-[#29374b] mb-6">
            <TabsTrigger value="overview" className="data-[state=active]:bg-[#c92946]">
              <Store className="w-4 h-4 mr-2" />
              OVERVIEW
            </TabsTrigger>
            <TabsTrigger value="codes" className="data-[state=active]:bg-[#c92946]">
              <Code className="w-4 h-4 mr-2" />
              CODES
            </TabsTrigger>
            <TabsTrigger value="redeem" className="data-[state=active]:bg-[#c92946]">
              <Gift className="w-4 h-4 mr-2" />
              REDEEM
            </TabsTrigger>
            <TabsTrigger value="players" className="data-[state=active]:bg-[#c92946]">
              <Users className="w-4 h-4 mr-2" />
              PLAYERS
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="glass-panel rounded-3xl p-12 text-center">
              <Store className="w-16 h-16 text-[#c92946] mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-[#d9deeb] mb-4">VENUE DASHBOARD</h3>
              <p className="text-[#d9deeb]/60">
                Connect your backend to view venue statistics and manage matches
              </p>
            </div>
          </TabsContent>

          <TabsContent value="codes">
            <div className="glass-panel rounded-3xl p-12 text-center">
              <Code className="w-16 h-16 text-[#c92946] mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-[#d9deeb] mb-4">MATCH CODES</h3>
              <p className="text-[#d9deeb]/60">
                Generate and manage match codes for your venue
              </p>
            </div>
          </TabsContent>

          <TabsContent value="redeem">
            <div className="glass-panel rounded-3xl p-12 text-center">
              <Gift className="w-16 h-16 text-[#c92946] mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-[#d9deeb] mb-4">REDEEM REWARDS</h3>
              <p className="text-[#d9deeb]/60">
                Verify and redeem customer reward codes
              </p>
            </div>
          </TabsContent>

          <TabsContent value="players">
            <div className="glass-panel rounded-3xl p-12 text-center">
              <Users className="w-16 h-16 text-[#c92946] mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-[#d9deeb] mb-4">ACTIVE PLAYERS</h3>
              <p className="text-[#d9deeb]/60">
                View players currently participating at your venue
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}
